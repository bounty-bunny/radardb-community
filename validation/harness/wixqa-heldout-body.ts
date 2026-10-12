/**
 * WixQA held-out evaluation of the LOCKED systems (same procedure as
 * the earlier locked held-out evaluator). Reads wixqa-selection-lock.json (committed);
 * refuses to run if the lock is uncommitted or modified.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PlanConfig } from "@/core/domain";
import { materialize, datasetVersionOf, type RepresentationSet } from "@/engine/representations";
import { embeddingsFor, executePlan } from "@/engine/executor";
import { demoRouter, resolvePlanClass } from "@/engine/router";
import { planKey } from "@/engine/labels";
import { warmModels } from "@/engine/models";
import { assertFrozen } from "./freeze";
import { documentRelevanceScorer, rankMetrics, rankedDocIds } from "./scorers";
import { BGE_QUERY_PREFIX, chunkAll, embedF, loadF, retrieveF } from "./baseline-f";
import { loadArticles, loadPrimaryQuestions, toDocuments, wixToOriginal } from "./datasets/wixqa";

const ROOT = process.env.RADAR_ROOT!;
const smoke = process.argv.includes("--smoke");
const frozen = assertFrozen(ROOT);
const lockFiles = ["validation/results/wixqa-selection-lock.json", "validation/results/WIXQA_SELECTION_LOCK.md"];
// The lock must be committed and unmodified before any held-out access.
execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...lockFiles], { cwd: ROOT });
const lockCommit = execFileSync("git", ["log", "-1", "--format=%H", "--", lockFiles[0]], { cwd: ROOT, encoding: "utf8" }).trim();
if (!lockCommit) throw new Error("selection lock is not committed");
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, lockFiles[0]), "utf8"));
const S = lock.systems;

interface RoutedSet {
  fallback: { config: PlanConfig };
  classPlans: { questionClass: string; config: PlanConfig }[];
}
const routed = (set: RoutedSet, question: string) => {
  const classes = set.classPlans.map((c) => c.questionClass);
  const cls = resolvePlanClass(demoRouter.route(question), classes, demoRouter.fallbackThreshold);
  return { planClass: cls, config: cls === "*" ? set.fallback.config : set.classPlans.find((c) => c.questionClass === cls)!.config };
};
const systems: Record<string, (q: string) => { planClass: string; config: PlanConfig }> = {
  RadarDB_quality: (q) => routed(S.RadarDB_quality, q),
  E_globalFixed_quality: () => ({ planClass: "*", config: S.E_globalFixed_quality.config }),
  RadarDB_balanced: (q) => routed(S.RadarDB_balanced, q),
  E_globalFixed_balanced: () => ({ planClass: "*", config: S.E_globalFixed_balanced.config }),
  A: () => ({ planClass: "*", config: S.A.config }),
  B: () => ({ planClass: "*", config: S.B.config }),
  C: () => ({ planClass: "*", config: S.C.config }),
  D: () => ({ planClass: "*", config: S.D.config }),
};

// ---- questions: held-out (or 5 optimization questions in smoke mode) ----
const split = JSON.parse(fs.readFileSync(path.join(ROOT, "validation/splits/wixqa.json"), "utf8")) as { questions: { questionId: string; subset: string; split: string }[] };
const wanted = smoke ? "optimization" : "validation";
const ids = new Set(split.questions.filter((q) => q.split === wanted).map((q) => q.questionId));
const splitQs = (await loadPrimaryQuestions()).filter((q) => ids.has(q.id)); // task order, as at selection
const pick = new Set(smoke ? splitQs.slice(0, 5).map((q) => q.id) : splitQs.map((q) => q.id));
const questions = splitQs
  .filter((q) => pick.has(q.id))
  .map((q) => ({
    id: q.id,
    question: q.question,
    questionClass: "unlabeled",
    requiredEvidence: [] as string[],
    split: wanted as "optimization" | "validation",
    provenance: "benchmark" as const,
    humanVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    goldDocIds: q.gold,
  }));
const heldOutLabelsRead = smoke ? 0 : questions.length;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), smoke ? "[smoke]" : "", ...a);
log(`questions ${questions.length} (${wanted}); lock ${lockCommit.slice(0, 7)}`);

// ---- corpus: full KB (same manifest as selection) ----
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "validation/work/wixqa/manifest-full.json"), "utf8")) as { rows: number[] };
const rows = new Set(manifest.rows);
const documents = toDocuments((await loadArticles()).filter((_, i) => rows.has(i)));
const datasetVersion = datasetVersionOf(documents);
if (datasetVersion !== lock.dataset.datasetVersion) throw new Error(`dataset version mismatch: ${datasetVersion} vs lock ${lock.dataset.datasetVersion}`);

// ---- distinct V1 configs ----
const configs = new Map<string, PlanConfig>();
const assignment: Record<string, Record<string, { planClass: string; configKey: string }>> = {};
for (const q of questions) {
  assignment[q.id] = {};
  for (const [name, resolve] of Object.entries(systems)) {
    const r = resolve(q.question);
    configs.set(planKey(r.config), r.config);
    assignment[q.id][name] = { planClass: r.planClass, configKey: planKey(r.config) };
  }
}
const repFor = (c: PlanConfig): Promise<RepresentationSet> => materialize(documents, datasetVersion, c.chunkingStrategy, embeddingsFor(c));
const scorer = documentRelevanceScorer(wixToOriginal);
type QM = ReturnType<typeof rankMetrics> & { coverage: number; precision: number; success: boolean; tokens: number; items: number; ranking: string[] };
const score = (items: Parameters<typeof scorer.score>[0], q: (typeof questions)[number]): QM => {
  const s = scorer.score(items, q);
  return { ...rankMetrics(rankedDocIds(items, wixToOriginal), q.goldDocIds), coverage: s.recall, precision: s.precision, success: s.success, tokens: items.reduce((a, i) => a + i.tokens, 0), items: items.length, ranking: rankedDocIds(items, wixToOriginal) };
};
const result: Record<string, Record<string, QM>> = {};
const latency: Record<string, Record<string, number>> = {};
const t0 = Date.now();
for (const [key, cfg] of configs) {
  const rs = await repFor(cfg);
  result[key] = {};
  for (const q of questions) result[key][q.id] = score((await executePlan(cfg, q.question, rs, { plan: { id: key, version: 0 }, cache: true })).items, q);
  log("evaluated", key);
}
// Measured latency: model result caches bypassed, warm indexes.
await warmModels({ embed: true, rerank: [...configs.values()].some((c) => c.reranker !== "none") });
for (const [key, cfg] of configs) {
  const rs = await repFor(cfg);
  latency[key] = {};
  for (const q of questions) latency[key][q.id] = Number((await executePlan(cfg, q.question, rs, { plan: { id: key, version: 0 }, cache: false })).measuredLatencyMs.toFixed(3));
  log("latency", key);
}
const v1Sec = (Date.now() - t0) / 1000;

// ---- Baseline F (OUTSIDE RADARDB), locked bge-small config ----
const F = S.baselineF;
const tF = Date.now();
await loadF("bge-small");
const fChunks = chunkAll(documents, F.chunking);
const fIndex = { chunking: F.chunking, chunks: fChunks, vectors: await embedF("bge-small", fChunks.map((c) => c.content)) };
const fIndexSec = (Date.now() - tF) / 1000;
// Quality: query vectors embedded as at selection (batches of 32 over the split's question list, task order).
const batchVectors = await embedF("bge-small", splitQs.map((q) => BGE_QUERY_PREFIX + q.question));
const qvOf = new Map(splitQs.map((q, i) => [q.id, batchVectors[i]]));
const fResult: Record<string, QM> = {};
const fLatency: Record<string, number> = {};
for (const q of questions) {
  fResult[q.id] = score(retrieveF(fIndex, qvOf.get(q.id)!, F.topK), q);
  const ts = performance.now();
  const [qv] = await embedF("bge-small", [BGE_QUERY_PREFIX + q.question]);
  retrieveF(fIndex, qv, F.topK);
  fLatency[q.id] = Number((performance.now() - ts).toFixed(3));
}
log("evaluated Baseline F");

const subsetOf = new Map(split.questions.map((q) => [q.questionId, q.subset]));
const out = {
  label: smoke ? "SMOKE TEST on optimization questions (not a result)" : "WixQA held-out evaluation (locked systems)",
  smoke,
  lockCommit,
  frozen,
  heldOutLabelsRead,
  n: questions.length,
  datasetVersion,
  subset: Object.fromEntries(questions.map((q) => [q.id, subsetOf.get(q.id)])),
  routing: Object.fromEntries(questions.map((q) => [q.id, demoRouter.route(q.question)]).map(([id, d]) => [id, { class: (d as { class: string }).class, confidence: (d as { confidence: number }).confidence }])),
  assignment,
  v1: result,
  v1LatencyMs: latency,
  baselineF: { key: F.key, indexSec: fIndexSec, chunks: fChunks.length, perQuestion: fResult, latencyMs: fLatency },
  timings: { v1Sec, fIndexSec },
  maxRssMB: Math.round(process.memoryUsage().rss / 1048576),
};
const file = smoke ? path.join(ROOT, "validation/work/wixqa/heldout-smoke.json") : path.join(ROOT, "validation/results/wixqa-heldout.json");
fs.writeFileSync(file, JSON.stringify(out));
log("DONE", `${questions.length} questions; v1 ${v1Sec.toFixed(0)}s; F index ${fIndexSec.toFixed(0)}s`);
