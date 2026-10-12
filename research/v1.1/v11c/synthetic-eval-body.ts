/**
 * WixQA Synthetic secondary-generalization evaluator (familiar corpus, new questions) for the LOCKED
 * WixQA FusionContextPlan. Modes:
 *   smoke   all 280 WixQA DEVELOPMENT questions: must reproduce the final fit exactly
 *           (Global rankings == stored V1 outcomes; fused R@5 and gain == candidate file)
 *   timing  30 DEVELOPMENT questions with caches bypassed: per-question cost → test runtime projection
 *   test    the locked Synthetic test questions (synthetic-audit.json), exactly once
 * Gates: lock files committed and unchanged; src/ unchanged since the lock commit; test refuses to run twice.
 * Quality metrics for Global come from the fusion's primary branch (identical by construction; parity checked
 * on a pre-declared subsample by a stand-alone Global run).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PlanConfig } from "@/core/domain";
import { materialize, datasetVersionOf, type RepresentationSet } from "@/engine/representations";
import { embeddingsFor, executePlan } from "@/engine/executor";
import { warmModels } from "@/engine/models";
import { rng } from "@/engine/v11/objective";
import { executeFusionPlan, fusionKey, type FusionPlanConfig } from "@/engine/v11/fusion";
import { rankMetrics, rankedDocIds } from "../../../validation/harness/scorers";
import { loadArticles, loadPrimaryQuestions, loadQuestions, toDocuments, wixToOriginal } from "../../../validation/harness/datasets/wixqa";

const ROOT = process.env.RADAR_ROOT!;
const mode = process.argv[2] as "smoke" | "timing" | "test";
if (!["smoke", "timing", "test"].includes(mode)) throw new Error("usage: synthetic-eval.ts <smoke|timing|test>");
const LOCK_FILES = ["research/v1.1/v11c/results/wixqa-synthetic-lock.json", "research/v1.1/v11c/WIXQA_SYNTHETIC_LOCK.md", "research/v1.1/v11b/results/candidate-fusionplan-wixqa.json", "research/v1.1/v11c/results/synthetic-audit.json"];
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
const readJson = <T>(f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")) as T;

const cand = readJson<{ globalPlan: { key: string; config: PlanConfig }; fusionPlan: { key: string; config: FusionPlanConfig }; options: { key: string; r5: number }[]; optimizationGainOverGlobal: { delta: number } }>(LOCK_FILES[2]);
let lockCommit: string | null = null;
// REPRODUCTION MODE (RADAR_REPRODUCE=1): re-run the locked test outside the original repository; git-history gates
// are skipped, the lock's systems are still checked, and results go to synthetic-test.reproduced.json.
const REPRODUCE = process.env.RADAR_REPRODUCE === "1";
if (mode === "test") {
  if (!REPRODUCE) {
    git("diff", "--quiet", "--", ...LOCK_FILES, "src/");
    lockCommit = git("log", "-1", "--format=%H", "--", LOCK_FILES[0]).trim();
    if (!lockCommit) throw new Error("lock not committed");
    git("diff", "--quiet", lockCommit, "--", ...LOCK_FILES, "src/");
  }
  const lock = readJson<{ systems: { fusionKey: string; globalKey: string }; latencySubsample: { n: number; seed: number } }>(LOCK_FILES[0]);
  if (lock.systems.fusionKey !== cand.fusionPlan.key || lock.systems.globalKey !== cand.globalPlan.key) throw new Error("LOCK INTEGRITY: systems");
}
const outFile = path.join(ROOT, `research/v1.1/v11c/results/synthetic-${mode}${REPRODUCE ? ".reproduced" : ""}.json`);
if (mode === "test" && !REPRODUCE && fs.existsSync(outFile)) throw new Error("test result already exists: the test runs exactly once");
const G = cand.globalPlan.config;
const F = cand.fusionPlan.config;
if (fusionKey(F) !== cand.fusionPlan.key) throw new Error("fusion key mismatch");

let peakRss = 0;
setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 500).unref();
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), mode, ...a);

// ---- questions ----
type Q = { id: string; question: string; gold: string[] };
let qs: Q[];
let heldOutLabelsRead = 0;
if (mode === "test") {
  const audit = readJson<{ testQuestions: { id: string; sharesGoldWithDevelopment: boolean }[] }>(LOCK_FILES[3]);
  const ids = new Set(audit.testQuestions.map((x) => x.id));
  const all = (await loadQuestions("synthetic")).filter((q) => ids.has(q.id));
  // Pre-declared seeded subsample of the eligible population (lock: testSubsample), drawn by id order before any retrieval.
  const sub = readJson<{ testSubsample: { n: number | null; seed: number } }>(LOCK_FILES[0]).testSubsample;
  if (sub.n == null || sub.n >= all.length) qs = all;
  else {
    const r = rng(sub.seed);
    const order = [...all.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const keep = new Set(order.slice(0, sub.n));
    qs = all.filter((_, i) => keep.has(i));
  }
  heldOutLabelsRead = qs.length;
} else {
  const dev = new Set(readJson<{ questions: { questionId: string; split: string }[] }>("validation/splits/wixqa.json").questions.filter((q) => q.split === "optimization").map((q) => q.questionId));
  qs = (await loadPrimaryQuestions()).filter((q) => dev.has(q.id));
  if (mode === "timing") qs = qs.slice(0, 30);
}
log(`questions ${qs.length}`);

// ---- corpus (full WixQA KB) ----
const rows = new Set(readJson<{ rows: number[] }>("validation/work/wixqa/manifest-full.json").rows);
const docs = toDocuments((await loadArticles()).filter((_, i) => rows.has(i)));
const version = datasetVersionOf(docs);
const repsFor = (c: PlanConfig): Promise<RepresentationSet> => materialize(docs, version, c.chunkingStrategy, embeddingsFor(c));
const reps = { primary: await repsFor(F.primary), partner: await repsFor(F.partner) };
log("representations ready", `${Math.round((Date.now() - t0) / 1000)} s`);

// ---- quality pass ----
const cache = mode !== "timing";
const records = [];
const qStart = Date.now();
for (const q of qs) {
  const f = await executeFusionPlan(F, q.question, reps, { plan: { id: "fusion", version: 1 }, cache });
  const gRank = rankedDocIds(f.primary.items, wixToOriginal);
  const fRank = rankedDocIds(f.items, wixToOriginal);
  const gm = rankMetrics(gRank, q.gold);
  const fm = rankMetrics(fRank, q.gold);
  const gold = new Set(q.gold);
  const top5 = { both: 0, "primary-only": 0, "partner-only": 0 };
  const seen: string[] = [];
  for (const it of f.items) {
    const d = wixToOriginal(it.provenance.documentId);
    if (seen.includes(d)) continue;
    seen.push(d);
    if (seen.length > 5) break;
    if (gold.has(d)) top5[it.provenance.fusion!.document]++;
  }
  records.push({ id: q.id, global: { ...gm, tokens: f.primary.tokens, ranking: gRank }, fusion: { ...fm, tokens: f.tokens, budget: f.budget }, partnerR5: rankMetrics(rankedDocIds(f.partner.items, wixToOriginal), q.gold).recall5, contributionTop5: top5, ms: f.latency.totalMs });
  if (records.length % 500 === 0) log(`quality ${records.length}/${qs.length}`);
}
const qualitySec = (Date.now() - qStart) / 1000;
log("quality pass done", `${Math.round(qualitySec)} s`);

const smoke: Record<string, unknown> = {};
if (mode === "smoke") {
  const stored = readJson<{ outcomes: Record<string, Record<string, { ranking?: string[] }>> }>("validation/work/wixqa/v1-full/search.json").outcomes[cand.globalPlan.key];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const fusedR5 = mean(records.map((r) => r.fusion.recall5));
  const gain = fusedR5 - mean(records.map((r) => r.global.recall5));
  smoke.globalRankingMismatchesVsStoredV1 = records.filter((r) => JSON.stringify(r.global.ranking) !== JSON.stringify(stored[r.id].ranking ?? [])).length;
  smoke.fusedR5 = fusedR5;
  smoke.lockedFinalFitFusedR5 = cand.options.find((o) => o.key === cand.fusionPlan.key)!.r5;
  smoke.gain = gain;
  smoke.lockedFinalFitGain = cand.optimizationGainOverGlobal.delta;
  smoke.reproduced = Math.abs(fusedR5 - (smoke.lockedFinalFitFusedR5 as number)) < 1e-12 && Math.abs(gain - (smoke.lockedFinalFitGain as number)) < 1e-12;
}
if (mode === "timing") smoke.coldSecPerQuestionFusion = qualitySec / qs.length;

// ---- measured latency + parity on a pre-declared seeded subsample (test) ----
const latency = [];
let parityMismatches = 0;
if (mode === "test") {
  const lock = readJson<{ latencySubsample: { n: number; seed: number } }>(LOCK_FILES[0]);
  const rand = rng(lock.latencySubsample.seed);
  const idx = [...qs.keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  await warmModels({ embed: true, rerank: true });
  const gReps = await repsFor(G);
  for (const i of idx.slice(0, lock.latencySubsample.n)) {
    const s = performance.now();
    const g = await executePlan(G, qs[i].question, gReps, { plan: { id: "global", version: 1 }, cache: false });
    const globalMs = performance.now() - s;
    if (JSON.stringify(rankedDocIds(g.items, wixToOriginal)) !== JSON.stringify(records[i].global.ranking)) parityMismatches++;
    const f = await executeFusionPlan(F, qs[i].question, reps, { plan: { id: "fusion", version: 1 }, cache: false });
    latency.push({ id: qs[i].id, globalMs, ...f.latency });
  }
  log("latency pass done");
}
fs.writeFileSync(
  outFile,
  JSON.stringify({ mode, lockCommit, codeCommit: git("rev-parse", "HEAD").trim(), heldOutLabelsRead, n: qs.length, datasetVersion: version, systems: { global: cand.globalPlan.key, fusion: cand.fusionPlan.key }, smoke, records: mode === "timing" ? [] : records, latency, parityMismatchesOnLatencySubsample: parityMismatches, resources: { totalSec: Math.round((Date.now() - t0) / 1000), qualitySec: Math.round(qualitySec), peakRssSampled500msMB: Math.round(peakRss / 1048576) } }),
);
log("DONE", JSON.stringify(smoke));
