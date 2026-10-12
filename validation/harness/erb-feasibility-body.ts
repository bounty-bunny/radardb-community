/**
 * EnterpriseRAG engine feasibility (DEVIATIONS 2026-10-01, ordering).
 * Question answered: can the frozen V1 engine execute this scale within the
 * preregistered budgets (PREREGISTRATION §8)? Optimization questions only.
 */
import fs from "node:fs";
import path from "node:path";
import { getHeapStatistics } from "node:v8";
import { constants as bufferConstants } from "node:buffer";
import { ExhaustiveSearch } from "@/engine/optimizer/strategies";
import { BASELINE_CONFIG, enumerateSpace } from "@/engine/optimizer/space";
import { datasetVersionOf } from "@/engine/representations";
import { demoRouter } from "@/engine/router";
import { assertFrozen } from "./freeze";
import { dirBytes } from "./monitor";
import { documentRelevanceScorer, rankedDocIds } from "./scorers";
import { search } from "./select";
import { loadCorpus, loadQuestions, readJson, toHarnessQuestions, type Manifest, type SplitRecord } from "./datasets/enterpriserag";

const ROOT = process.env.RADAR_ROOT!;
const scale = Number(process.argv[2] ?? 10000);
const work = process.cwd();
const resultFile = path.join(ROOT, `validation/results/enterpriserag-feasibility-${scale}.json`);
const eventsFile = path.join(work, "feasibility-events.jsonl");
const heartbeatFile = path.join(work, "feasibility-heartbeat.json");
const BUDGET = { ingestAndRepresentSec: 7200, searchSec: 21600, rssMB: 10240, diskMB: 25600 };
fs.writeFileSync(eventsFile, "");

const t0 = Date.now();
let stage = "start";
let stageStart = Date.now();
let peakRss = 0;
const startedAt = new Date().toISOString();
const facts: Record<string, unknown> = {};
const ev = (event: string, data: Record<string, unknown> = {}) => {
  const rss = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rss);
  const row = { t: new Date().toISOString(), elapsedSec: Math.round((Date.now() - t0) / 1000), stage, event, rssMB: Math.round(rss / 1048576), heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1048576), ...data };
  fs.appendFileSync(eventsFile, JSON.stringify(row) + "\n");
  console.log(JSON.stringify(row));
};
const setStage = (s: string) => {
  stage = s;
  stageStart = Date.now();
  ev("stage");
};

const finish = (outcome: "COMPLETED" | "FAILED", classification: string | null, error?: unknown) => {
  const report = {
    test: `enterpriserag-feasibility-${scale}`,
    label: "V1 ENGINE feasibility (optimization questions only; no held-out labels; no comparisons)",
    outcome,
    classification,
    error: error ? { name: (error as Error).name, message: (error as Error).message, stage } : null,
    startedAt,
    endedAt: new Date().toISOString(),
    totalSec: Math.round((Date.now() - t0) / 1000),
    budgets: BUDGET,
    runtime: { node: process.version, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null, heapLimitMB: Math.round(getHeapStatistics().heap_size_limit / 1048576), maxStringLength: bufferConstants.MAX_STRING_LENGTH },
    peakRssMB: Math.round(peakRss / 1048576),
    diskMB: Math.round(dirBytes(work) / 1048576),
    ...facts,
  };
  fs.writeFileSync(resultFile, JSON.stringify(report, null, 2));
  ev("finish", { outcome, classification });
  process.exit(outcome === "COMPLETED" ? 0 : 3);
};

// Watchdog for the preregistered budgets.
let lastDisk = 0;
const watchdog = setInterval(() => {
  const rss = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rss);
  const stageSec = (Date.now() - stageStart) / 1000;
  const sinceStart = (Date.now() - t0) / 1000;
  if (Date.now() - lastDisk > 60000) {
    lastDisk = Date.now();
    const mb = dirBytes(work) / 1048576;
    if (mb > BUDGET.diskMB) return finish("FAILED", "DISK_LIMIT", new Error(`work dir ${Math.round(mb)} MB > ${BUDGET.diskMB} MB`));
  }
  fs.writeFileSync(heartbeatFile, JSON.stringify({ t: new Date().toISOString(), stage, stageSec: Math.round(stageSec), rssMB: Math.round(rss / 1048576), peakRssMB: Math.round(peakRss / 1048576) }));
  if (rss / 1048576 > BUDGET.rssMB) return finish("FAILED", "SYSTEM_MEMORY_LIMIT", new Error(`RSS ${Math.round(rss / 1048576)} MB > ${BUDGET.rssMB} MB budget`));
  if ((stage === "ingest" || stage === "represent") && sinceStart > BUDGET.ingestAndRepresentSec)
    return finish("FAILED", "EMBEDDING_TIME_LIMIT", new Error(`ingestion + representation exceeded ${BUDGET.ingestAndRepresentSec}s`));
  if (stage === "search" && stageSec > BUDGET.searchSec) return finish("FAILED", "OPTIMIZER_TIME_LIMIT", new Error(`search exceeded ${BUDGET.searchSec}s`));
}, 5000);
watchdog.unref();

/** Exact JSON length V1's DiskCache.flush() will produce for the embedding cache, computed without building the string. */
function cacheJsonChars(key: string, valueLen: (v: unknown) => number): { entries: number; jsonChars: number } {
  const c = (globalThis as unknown as Record<string, { map?: Map<string, unknown> } | undefined>)[key];
  const map = c?.map;
  if (!map) return { entries: 0, jsonChars: 2 };
  let n = 2;
  for (const [k, v] of map) n += JSON.stringify(k).length + 1 + valueLen(v) + 1;
  return { entries: map.size, jsonChars: n - (map.size ? 1 : 0) };
}

try {
  facts.frozen = assertFrozen(ROOT);
  setStage("ingest");
  const manifest = readJson<Manifest>(path.join(ROOT, `validation/work/enterpriserag/manifest-${scale}.json`));
  const split = readJson<{ questions: SplitRecord[] }>(path.join(ROOT, "validation/splits/enterpriserag.json")).questions;
  // Optimization questions only: held-out questions are dropped before anything else touches them.
  const opt = toHarnessQuestions(await loadQuestions(), split).filter((q) => q.split === "optimization");
  const { documents, toOriginal } = await loadCorpus(manifest);
  const chars = documents.reduce((s, d) => s + d.content.length, 0);
  const dataset = { version: datasetVersionOf(documents), documents };
  facts.corpus = { documents: documents.length, characters: chars, manifestSha256: manifest.sha256, datasetVersion: dataset.version, goldDensity: manifest.goldDensity };
  facts.questions = { optimization: opt.length, heldOutRead: 0 };
  ev("ingested", facts.corpus as Record<string, unknown>);

  setStage("represent");
  const representations: unknown[] = [];
  facts.representations = representations;
  let searchStartedAt = "";
  const res = await search({
    dataset,
    questions: opt,
    router: demoRouter,
    strategy: new ExhaustiveSearch(),
    baselineConfig: BASELINE_CONFIG,
    space: enumerateSpace(),
    scorer: documentRelevanceScorer(toOriginal),
    rankOf: (items) => rankedDocIds(items, toOriginal),
    onRepresentation: (info) => {
      representations.push({ ...info, sec: Math.round(info.ms / 1000) });
      ev("representation", { chunking: info.chunking, chunks: info.chunks, vectors: info.vectors, sec: Math.round(info.ms / 1000) });
    },
    onProgress: (s, done, total) => {
      if (s === "Searching configurations" && stage !== "search") {
        facts.representationBuildSec = Math.round((Date.now() - stageStart) / 1000);
        setStage("search");
        searchStartedAt = new Date().toISOString();
        facts.searchStartedAt = searchStartedAt;
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
      } else {
        ev("cache-serialization-error", { name: (error as Error)?.name, message: (error as Error)?.message });
      }
    },
  });

  setStage("save-search");
  facts.optimizer = { configurations: res.trials.length, distinctBehaviors: res.distinctBehaviors, chunks: res.chunks };
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
  facts.calibration = res.calibration;
  finish("COMPLETED", null);
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
  finish("FAILED", cls, e);
}
