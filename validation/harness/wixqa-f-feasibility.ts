/**
 * Baseline F feasibility for WixQA primary questions. OUTSIDE RADARDB. Same procedure,
 * budgets and instrumentation as the earlier Baseline F feasibility script; only the loader differs.
 * Optimization questions only; no held-out labels; no comparative metrics reported.
 *   NODE_OPTIONS=--max-old-space-size=8192 node node_modules/tsx/dist/cli.mjs --tsconfig validation/tsconfig.json validation/harness/wixqa-f-feasibility.ts <2000|full> <bge-base|bge-small>
 */
import fs from "node:fs";
import path from "node:path";
import { getHeapStatistics } from "node:v8";
import type { ChunkingStrategy } from "@/core/domain";
import { assertFrozen } from "./freeze";
import { dirBytes } from "./monitor";
import { documentRelevanceScorer, rankedDocIds } from "./scorers";
import { BGE_QUERY_PREFIX, F_DTYPE, F_MODELS, chunkAll, embedF, loadF, retrieveF, type FIndex, type FModel } from "./baseline-f";
import { loadArticles, loadPrimaryQuestions, toDocuments, toHarnessQuestions, wixToOriginal } from "./datasets/wixqa";
import { readJson } from "./datasets/enterpriserag";

const ROOT = process.cwd();
const scale = process.argv[2];
const model = process.argv[3] as FModel;
if ((scale !== "2000" && scale !== "full") || !(model in F_MODELS)) throw new Error("usage: wixqa-f-feasibility.ts <2000|full> <bge-base|bge-small>");
const work = path.join(ROOT, "validation/work/wixqa", `F-${model}-${scale}`);
fs.mkdirSync(work, { recursive: true });
const resultFile = path.join(ROOT, `validation/results/wixqa-baselineF-feasibility-${model}-${scale}.json`);
const eventsFile = path.join(work, "feasibility-events.jsonl");
fs.writeFileSync(eventsFile, "");
const BUDGET = { indexingSec: 7200, searchSec: 21600, rssMB: 10240, diskMB: 25600 };
const CHUNKINGS: ChunkingStrategy[] = ["fixed-512", "fixed-256", "section", "sentence-window"];
const TOPK = [3, 5, 8];

const t0 = Date.now();
let stage = "start";
let stageStart = Date.now();
let peakRss = 0;
let maxHeap = 0;
const facts: Record<string, unknown> = { model: F_MODELS[model], dtype: F_DTYPE, pooling: "cls", normalized: true, queryPrefix: BGE_QUERY_PREFIX, label: "Baseline F — OUTSIDE RADARDB" };
const ev = (event: string, data: Record<string, unknown> = {}) => {
  const m = process.memoryUsage();
  peakRss = Math.max(peakRss, m.rss);
  maxHeap = Math.max(maxHeap, m.heapUsed);
  const row = { t: new Date().toISOString(), elapsedSec: Math.round((Date.now() - t0) / 1000), stage, event, rssMB: Math.round(m.rss / 1048576), heapUsedMB: Math.round(m.heapUsed / 1048576), ...data };
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
  fs.writeFileSync(
    resultFile,
    JSON.stringify(
      {
        test: `wixqa-baselineF-feasibility-${model}-${scale}`,
        label: "Baseline F (OUTSIDE RADARDB) feasibility — optimization questions only; no held-out labels; no comparative metrics",
        outcome,
        classification,
        error: error ? { message: (error as Error).message, stage } : null,
        totalSec: Math.round((Date.now() - t0) / 1000),
        budgets: BUDGET,
        runtime: { node: process.version, nodeOptions: process.env.NODE_OPTIONS ?? null, heapLimitMB: Math.round(getHeapStatistics().heap_size_limit / 1048576) },
        maxRssSampledEvery5sMB: Math.round(peakRss / 1048576),
        maxJsHeapObservedAtInstrumentationEventsMB: Math.round(maxHeap / 1048576),
        diskMB: Math.round(dirBytes(work) / 1048576),
        ...facts,
      },
      null,
      2,
    ),
  );
  process.exit(outcome === "PASS" ? 0 : 3);
};
const watchdog = setInterval(() => {
  const rss = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rss);
  fs.writeFileSync(path.join(work, "feasibility-heartbeat.json"), JSON.stringify({ t: new Date().toISOString(), stage, rssMB: Math.round(rss / 1048576), maxRssSampledMB: Math.round(peakRss / 1048576) }));
  if (rss / 1048576 > BUDGET.rssMB) return finish("RESOURCE_LIMIT_FAILURE", "SYSTEM_MEMORY_LIMIT", new Error(`RSS ${Math.round(rss / 1048576)} MB > ${BUDGET.rssMB} MB`));
  if ((stage === "ingest" || stage === "index") && (Date.now() - t0) / 1000 > BUDGET.indexingSec)
    return finish("RESOURCE_LIMIT_FAILURE", "EMBEDDING_TIME_LIMIT", new Error(`Baseline F indexing exceeded ${BUDGET.indexingSec}s`));
  if (stage === "search" && (Date.now() - stageStart) / 1000 > BUDGET.searchSec) return finish("RESOURCE_LIMIT_FAILURE", "OPTIMIZER_TIME_LIMIT", new Error("search exceeded budget"));
}, 5000);
watchdog.unref();

try {
  facts.frozen = assertFrozen(ROOT);
  setStage("ingest");
  const manifest = readJson<{ rows: number[]; sha256: string; goldDensity: number }>(path.join(ROOT, `validation/work/wixqa/manifest-${scale}.json`));
  const split = readJson<{ questions: { questionId: string; split: "optimization" | "validation" }[] }>(path.join(ROOT, "validation/splits/wixqa.json")).questions;
  const questions = toHarnessQuestions(await loadPrimaryQuestions(), split).filter((q) => q.split === "optimization");
  const rows = new Set(manifest.rows);
  const documents = toDocuments(
    (await loadArticles()).filter((_, i) => rows.has(i)));
  facts.corpus = { dataset: "wixqa", scale, documents: documents.length, characters: documents.reduce((s, d) => s + d.content.length, 0), manifestSha256: manifest.sha256, goldDensity: manifest.goldDensity };
  facts.questions = { optimization: questions.length, heldOutRead: 0 };
  ev("ingested", facts.corpus as Record<string, unknown>);

  setStage("index");
  await loadF(model);
  ev("model-loaded");
  const indexes: FIndex[] = [];
  const indexing: unknown[] = [];
  facts.indexing = indexing;
  for (const chunking of CHUNKINGS) {
    const ts = Date.now();
    const chunks = chunkAll(documents, chunking);
    const vectors = await embedF(model, chunks.map((c) => c.content));
    indexes.push({ chunking, chunks, vectors });
    const sec = Math.round((Date.now() - ts) / 1000);
    indexing.push({ chunking, chunks: chunks.length, dim: vectors[0]?.length ?? 0, sec });
    ev("index", { chunking, chunks: chunks.length, sec });
  }
  facts.indexingSec = Math.round((Date.now() - stageStart) / 1000);

  setStage("search");
  const qv = await embedF(
    model,
    questions.map((q) => BGE_QUERY_PREFIX + q.question),
  );
  const scorer = documentRelevanceScorer(wixToOriginal);
  const results: Record<string, Record<string, { recall: number; precision: number; success: boolean; tokens: number; ranking: string[] }>> = {};
  for (const idx of indexes)
    for (const k of TOPK) {
      const key = `${idx.chunking}|k${k}`;
      results[key] = {};
      questions.forEach((q, i) => {
        const items = retrieveF(idx, qv[i], k);
        const s = scorer.score(items, q);
        results[key][q.id] = { ...s, tokens: items.reduce((a, it) => a + it.tokens, 0), ranking: rankedDocIds(items, wixToOriginal) };
      });
    }
  facts.searchSec = Math.round((Date.now() - stageStart) / 1000);
  facts.configurations = Object.keys(results).length;
  // Optimization-set outcomes are saved for later selection; not reported here.
  fs.writeFileSync(path.join(work, "f-search.json"), JSON.stringify({ model: F_MODELS[model], results }));
  finish("PASS", null);
} catch (e) {
  const msg = String((e as Error)?.message ?? e);
  finish("RESOURCE_LIMIT_FAILURE", /heap|allocation failed/i.test(msg) ? "NODE_HEAP_LIMIT" : /ENOSPC/i.test(msg) ? "DISK_LIMIT" : "UNKNOWN", e);
}
