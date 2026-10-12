/**
 * Shared engine-feasibility runner (same instrumentation, watchdog and
 * failure classification as the EnterpriseRAG 10K run, beec1ce).
 * Optimization questions only. Preregistered budgets: PREREGISTRATION §8.
 */
import fs from "node:fs";
import path from "node:path";
import { getHeapStatistics } from "node:v8";
import { constants as bufferConstants } from "node:buffer";
import type { Document } from "@/core/domain";
import { ExhaustiveSearch } from "@/engine/optimizer/strategies";
import { BASELINE_CONFIG, enumerateSpace } from "@/engine/optimizer/space";
import { datasetVersionOf } from "@/engine/representations";
import { demoRouter } from "@/engine/router";
import { assertFrozen } from "./freeze";
import { dirBytes } from "./monitor";
import { documentRelevanceScorer, rankedDocIds, type HarnessQuestion } from "./scorers";
import { search } from "./select";

export const BUDGET = { ingestAndRepresentSec: 7200, searchSec: 21600, rssMB: 10240, diskMB: 25600 };

export async function runFeasibility(args: {
  name: string;
  label: string;
  root: string;
  work: string;
  resultFile: string;
  load: () => Promise<{ documents: Document[]; toOriginal: (id: string) => string; questions: HarnessQuestion[]; corpusFacts: Record<string, unknown> }>;
}) {
  const { work } = args;
  const eventsFile = path.join(work, "feasibility-events.jsonl");
  const heartbeatFile = path.join(work, "feasibility-heartbeat.json");
  fs.writeFileSync(eventsFile, "");
  const t0 = Date.now();
  let stage = "start";
  let stageStart = Date.now();
  let peakRss = 0;
  let maxHeapAtEvents = 0;
  const startedAt = new Date().toISOString();
  const facts: Record<string, unknown> = {};
  const ev = (event: string, data: Record<string, unknown> = {}) => {
    const mem = process.memoryUsage();
    peakRss = Math.max(peakRss, mem.rss);
    maxHeapAtEvents = Math.max(maxHeapAtEvents, mem.heapUsed);
    const row = { t: new Date().toISOString(), elapsedSec: Math.round((Date.now() - t0) / 1000), stage, event, rssMB: Math.round(mem.rss / 1048576), heapUsedMB: Math.round(mem.heapUsed / 1048576), ...data };
    fs.appendFileSync(eventsFile, JSON.stringify(row) + "\n");
    console.log(JSON.stringify(row));
  };
  const setStage = (s: string) => {
    stage = s;
    stageStart = Date.now();
    ev("stage");
  };
  const finish = (outcome: "PASS" | "RESOURCE_LIMIT_FAILURE", classification: string | null, error?: unknown) => {
    ev("finish", { outcome, classification });
    const report = {
      test: args.name,
      label: args.label,
      outcome,
      classification,
      error: error ? { name: (error as Error).name, message: (error as Error).message, stage } : null,
      startedAt,
      endedAt: new Date().toISOString(),
      totalSec: Math.round((Date.now() - t0) / 1000),
      budgets: BUDGET,
      runtime: { node: process.version, nodeOptions: process.env.NODE_OPTIONS ?? null, heapLimitMB: Math.round(getHeapStatistics().heap_size_limit / 1048576), maxStringLength: bufferConstants.MAX_STRING_LENGTH },
      maxRssSampledEvery5sMB: Math.round(peakRss / 1048576),
      maxJsHeapObservedAtInstrumentationEventsMB: Math.round(maxHeapAtEvents / 1048576),
      diskMB: Math.round(dirBytes(work) / 1048576),
      ...facts,
    };
    fs.writeFileSync(args.resultFile, JSON.stringify(report, null, 2));
    process.exit(outcome === "PASS" ? 0 : 3);
  };

  let lastDisk = 0;
  const watchdog = setInterval(() => {
    const rss = process.memoryUsage().rss;
    peakRss = Math.max(peakRss, rss);
    const stageSec = (Date.now() - stageStart) / 1000;
    const sinceStart = (Date.now() - t0) / 1000;
    if (Date.now() - lastDisk > 60000) {
      lastDisk = Date.now();
      const mb = dirBytes(work) / 1048576;
      if (mb > BUDGET.diskMB) return finish("RESOURCE_LIMIT_FAILURE", "DISK_LIMIT", new Error(`work dir ${Math.round(mb)} MB > ${BUDGET.diskMB} MB`));
    }
    fs.writeFileSync(heartbeatFile, JSON.stringify({ t: new Date().toISOString(), stage, stageSec: Math.round(stageSec), rssMB: Math.round(rss / 1048576), maxRssSampledMB: Math.round(peakRss / 1048576) }));
    if (rss / 1048576 > BUDGET.rssMB) return finish("RESOURCE_LIMIT_FAILURE", "SYSTEM_MEMORY_LIMIT", new Error(`RSS ${Math.round(rss / 1048576)} MB > ${BUDGET.rssMB} MB budget`));
    if ((stage === "ingest" || stage === "represent") && sinceStart > BUDGET.ingestAndRepresentSec)
      return finish("RESOURCE_LIMIT_FAILURE", "EMBEDDING_TIME_LIMIT", new Error(`ingestion + representation exceeded ${BUDGET.ingestAndRepresentSec}s`));
    if (stage === "search" && stageSec > BUDGET.searchSec) return finish("RESOURCE_LIMIT_FAILURE", "OPTIMIZER_TIME_LIMIT", new Error(`search exceeded ${BUDGET.searchSec}s`));
  }, 5000);
  watchdog.unref();

  const cacheJsonChars = (key: string, valueLen: (v: unknown) => number) => {
    const c = (globalThis as unknown as Record<string, { map?: Map<string, unknown> } | undefined>)[key];
    const map = c?.map;
    if (!map) return { entries: 0, jsonChars: 2 };
    let n = 2;
    for (const [k, v] of map) n += JSON.stringify(k).length + 1 + valueLen(v) + 1;
    return { entries: map.size, jsonChars: n - (map.size ? 1 : 0) };
  };

  try {
    facts.frozen = assertFrozen(args.root);
    setStage("ingest");
    const loaded = await args.load();
    const leaked = loaded.questions.filter((q) => q.split !== "optimization");
    if (leaked.length) throw new Error(`HOLDOUT ISOLATION: ${leaked.length} non-optimization questions passed to feasibility`);
    const chars = loaded.documents.reduce((s, d) => s + d.content.length, 0);
    const dataset = { version: datasetVersionOf(loaded.documents), documents: loaded.documents };
    facts.corpus = { documents: loaded.documents.length, characters: chars, datasetVersion: dataset.version, ...loaded.corpusFacts };
    facts.questions = { optimization: loaded.questions.length, heldOutRead: 0 };
    ev("ingested", facts.corpus as Record<string, unknown>);

    setStage("represent");
    const representations: unknown[] = [];
    facts.representations = representations;
    const res = await search({
      dataset,
      questions: loaded.questions,
      router: demoRouter,
      strategy: new ExhaustiveSearch(),
      baselineConfig: BASELINE_CONFIG,
      space: enumerateSpace(),
      scorer: documentRelevanceScorer(loaded.toOriginal),
      rankOf: (items) => rankedDocIds(items, loaded.toOriginal),
      onRepresentation: (info) => {
        representations.push({ chunking: info.chunking, chunks: info.chunks, vectors: info.vectors, sec: Math.round(info.ms / 1000) });
        ev("representation", { chunking: info.chunking, chunks: info.chunks, vectors: info.vectors, sec: Math.round(info.ms / 1000) });
      },
      onProgress: (s, done, total) => {
        if (s === "Searching configurations" && stage !== "search") {
          facts.representationBuildSec = Math.round((Date.now() - stageStart) / 1000);
          setStage("search");
          facts.searchStartedAt = new Date().toISOString();
        }
        if (s === "Searching configurations" && done % 40 === 0) ev("progress", { done, total });
      },
      onCacheFlush: (phase, error) => {
        if (phase === "before") {
          facts.searchCompletedAt = new Date().toISOString();
          facts.searchSec = Math.round((Date.now() - stageStart) / 1000);
          setStage("cache-serialization");
          const emb = cacheJsonChars("radar.embedCache", (v) => 2 + 4 * Math.ceil((v as Float32Array).byteLength / 3));
          const rr = cacheJsonChars("radar.rerankCache", (v) => JSON.stringify(v).length);
          facts.cacheBeforeSerialization = { embeddings: emb, rerank: rr, maxStringLength: bufferConstants.MAX_STRING_LENGTH, embeddingsExceedsLimit: emb.jsonChars > bufferConstants.MAX_STRING_LENGTH };
          ev("cache-serialization-attempt", facts.cacheBeforeSerialization as Record<string, unknown>);
        } else if (phase === "after") {
          const f = path.join(work, ".radar", "cache", "embeddings.json");
          facts.cacheAfterSerialization = { embeddingsFileBytes: fs.existsSync(f) ? fs.statSync(f).size : null };
          ev("cache-serialization-ok", facts.cacheAfterSerialization as Record<string, unknown>);
        } else ev("cache-serialization-error", { name: (error as Error)?.name, message: (error as Error)?.message });
      },
    });

    setStage("save-search");
    facts.optimizer = { configurations: res.trials.length, distinctBehaviors: res.distinctBehaviors, chunks: res.chunks, calibration: res.calibration };
    fs.writeFileSync(
      path.join(work, "search.json"),
      JSON.stringify({
        datasetVersion: dataset.version,
        calibration: res.calibration,
        chunks: res.chunks,
        distinctBehaviors: res.distinctBehaviors,
        baselineKey: res.baselineKey,
        trials: res.trials,
        routedClass: Object.fromEntries(res.routedClass),
        outcomes: Object.fromEntries([...res.outcomes].map(([k, m]) => [k, Object.fromEntries([...m].map(([q, o]) => [q, { ...o, ids: undefined }]))])),
      }),
    );
    finish("PASS", null);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const cls =
      /Invalid string length/i.test(msg) && stage === "cache-serialization"
        ? "STRING_SERIALIZATION_LIMIT"
        : /Invalid string length/i.test(msg) && stage === "save-search"
          ? "STATE_SERIALIZATION_FAILURE"
          : /heap|allocation failed/i.test(msg)
            ? "NODE_HEAP_LIMIT"
            : /ENOSPC/i.test(msg)
              ? "DISK_LIMIT"
              : "UNKNOWN";
    finish("RESOURCE_LIMIT_FAILURE", cls, e);
  }
}
