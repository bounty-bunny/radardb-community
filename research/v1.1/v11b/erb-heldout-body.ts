/**
 * V1.1B EnterpriseRAG evaluator for the LOCKED systems (lock prepared at 5dc1bf9).
 *   modes:  smoke-2k   all 328 OPTIMIZATION questions at 2K: must reproduce the locked final fit
 *                      (Global rankings == stored V1 outcomes; fused / Global R@5 == candidate file)
 *           smoke-10k  5 OPTIMIZATION questions at 10K: deterministic re-execution, token budget respected
 *           heldout    the 142 locked held-out questions at 10K, exactly once
 * Gates (all modes): lock files unchanged since 5dc1bf9 and in the working tree; src/ unchanged since
 * 5dc1bf9; fusion implementation and split hashes equal the lock. The held-out mode additionally refuses
 * to run if a held-out result file already exists.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PlanConfig } from "@/core/domain";
import { materialize, datasetVersionOf, type RepresentationSet } from "@/engine/representations";
import { embeddingsFor, executePlan } from "@/engine/executor";
import { warmModels } from "@/engine/models";
import { executeFusionPlan, fusionKey, type FusionPlanConfig, type FusionResult } from "@/engine/v11/fusion";
import { rankMetrics, rankedDocIds } from "../../../validation/harness/scorers";
import { loadCorpus, loadQuestions, readJson, type Manifest } from "../../../validation/harness/datasets/enterpriserag";

const ROOT = process.env.RADAR_ROOT!;
const mode = process.argv[2] as "smoke-2k" | "smoke-10k" | "heldout";
if (!["smoke-2k", "smoke-10k", "heldout"].includes(mode)) throw new Error("usage: erb-heldout.ts <smoke-2k|smoke-10k|heldout>");
const LOCK_COMMIT = "5dc1bf9";
const LOCK_FILES = ["research/v1.1/v11b/results/erb-v11b-lock.json", "research/v1.1/v11b/ERB_V1.1B_LOCK.md", "research/v1.1/v11b/results/candidate-fusionplan-erb-2k.json"];
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
const sha = (f: string) => createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");

// ---------------- integrity gates ----------------
// REPRODUCTION MODE (RADAR_REPRODUCE=1): for re-running the locked evaluation outside the original repository
// (e.g. a clean public checkout without the lock commit). Git-history gates are skipped; the locked file hashes
// below are still verified, and results go to a separate *.reproduced.json file. The sealed result is never overwritten.
const REPRODUCE = process.env.RADAR_REPRODUCE === "1";
if (!REPRODUCE) {
  git("cat-file", "-e", LOCK_COMMIT);
  git("diff", "--quiet", LOCK_COMMIT, "--", ...LOCK_FILES, "src/"); // committed state since the lock
  git("diff", "--quiet", "--", ...LOCK_FILES, "src/"); // working tree
}
const lock = readJson<{
  hashes: Record<string, { path: string; sha256: string }>;
  systems: { globalFixed: { key: string; config: PlanConfig }; fusionContextPlan: { key: string; config: FusionPlanConfig } };
  test: { corpus: { datasetVersion: string; manifestSha256: string }; n: number };
  primary: { bootstrap: { resamples: number; seed: number } };
}>(path.join(ROOT, LOCK_FILES[0]));
for (const h of ["splitFile", "fusionImplementation", "candidatePlan"]) if (sha(lock.hashes[h].path) !== lock.hashes[h].sha256) throw new Error(`LOCK INTEGRITY: ${h} hash differs`);
const G: PlanConfig = lock.systems.globalFixed.config;
const F: FusionPlanConfig = lock.systems.fusionContextPlan.config;
if (fusionKey(F) !== lock.systems.fusionContextPlan.key) throw new Error("LOCK INTEGRITY: fusion key");
const outFile = path.join(ROOT, `research/v1.1/v11b/results/erb-${mode}${REPRODUCE ? ".reproduced" : ""}.json`);
if (mode === "heldout" && !REPRODUCE && fs.existsSync(outFile)) throw new Error("held-out result already exists: the test runs exactly once");

let peakRss = 0;
const sampler = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 500);
sampler.unref();
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), mode, ...a);

// ---------------- questions ----------------
const split = readJson<{ questions: { questionId: string; split: string }[] }>(path.join(ROOT, "validation/splits/enterpriserag.json")).questions;
const wanted = mode === "heldout" ? "validation" : "optimization";
const ids = new Set(split.filter((q) => q.split === wanted).map((q) => q.questionId));
let qs = (await loadQuestions()).filter((q) => ids.has(q.question_id)).map((q) => ({ id: q.question_id, question: q.question, type: q.question_type, gold: [...new Set(q.expected_doc_ids ?? [])] }));
if (mode === "smoke-10k") qs = qs.slice(0, 5);
const heldOutLabelsRead = mode === "heldout" ? qs.length : 0;
if (mode === "heldout" && qs.length !== lock.test.n) throw new Error(`expected ${lock.test.n} held-out questions, got ${qs.length}`);
log(`questions ${qs.length} (${wanted})`);

// ---------------- corpus ----------------
const scale = mode === "smoke-2k" ? 2000 : 10000;
const manifest = readJson<Manifest>(path.join(ROOT, `validation/work/enterpriserag/manifest-${scale}.json`));
const { documents, toOriginal } = await loadCorpus(manifest);
const version = datasetVersionOf(documents);
if (scale === 10000 && (version !== lock.test.corpus.datasetVersion || manifest.sha256 !== lock.test.corpus.manifestSha256)) throw new Error("LOCK INTEGRITY: 10K corpus differs");
const repsFor = (c: PlanConfig): Promise<RepresentationSet> => materialize(documents, version, c.chunkingStrategy, embeddingsFor(c));
const reps = { primary: await repsFor(F.primary), partner: await repsFor(F.partner) };
const gReps = await repsFor(G);
log("corpus + representations ready", `${Math.round((Date.now() - t0) / 1000)} s`);

// ---------------- quality pass (deterministic, caches on) ----------------
const metrics = (r: string[], gold: string[]) => rankMetrics(r, gold);
const records = [];
for (const q of qs) {
  const g = await executePlan(G, q.question, gReps, { plan: { id: "global", version: 1 }, cache: true });
  const f: FusionResult = await executeFusionPlan(F, q.question, reps, { plan: { id: "fusion", version: 1 }, cache: true });
  const gRank = rankedDocIds(g.items, toOriginal);
  const fRank = rankedDocIds(f.items, toOriginal);
  const pRank = rankedDocIds(f.partner.items, toOriginal);
  const gold = new Set(q.gold);
  const contribution = (k: number) => {
    const c = { both: 0, "primary-only": 0, "partner-only": 0 };
    const seen: string[] = [];
    for (const it of f.items) {
      const d = toOriginal(it.provenance.documentId);
      if (seen.includes(d)) continue;
      seen.push(d);
      if (seen.length > k) break;
      if (gold.has(d)) c[it.provenance.fusion!.document]++;
    }
    return c;
  };
  records.push({
    id: q.id,
    type: q.type,
    gold: q.gold.length,
    global: { ...metrics(gRank, q.gold), tokens: g.tokens, ranking: gRank },
    fusion: { ...metrics(fRank, q.gold), tokens: f.tokens, budget: f.budget, ranking: fRank },
    partnerR5: metrics(pRank, q.gold).recall5,
    primaryBranchEqualsGlobal: JSON.stringify(rankedDocIds(f.primary.items, toOriginal)) === JSON.stringify(gRank),
    contributionTop5: contribution(5),
    contributionContext: contribution(Infinity),
  });
}
log("quality pass done");

// ---------------- smoke checks ----------------
const smoke: Record<string, unknown> = {};
if (mode === "smoke-2k") {
  const stored = readJson<{ outcomes: Record<string, Record<string, { ranking?: string[] }>> }>(path.join(ROOT, "validation/work/enterpriserag/scale-2000/search.json")).outcomes[lock.systems.globalFixed.key];
  const cand = readJson<{ options: { key: string; r5: number }[]; optimizationGainOverGlobal: { delta: number } }>(path.join(ROOT, LOCK_FILES[2]));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const fusedR5 = mean(records.map((r) => r.fusion.recall5));
  const globalR5 = mean(records.map((r) => r.global.recall5));
  smoke.globalRankingMismatchesVsStoredV1 = records.filter((r) => JSON.stringify(r.global.ranking) !== JSON.stringify(stored[r.id].ranking ?? [])).length;
  smoke.fusedR5 = fusedR5;
  smoke.lockedFinalFitFusedR5 = cand.options.find((o) => o.key === lock.systems.fusionContextPlan.key)!.r5;
  smoke.gainOverGlobal = fusedR5 - globalR5;
  smoke.lockedFinalFitGain = cand.optimizationGainOverGlobal.delta;
  smoke.reproduced = smoke.globalRankingMismatchesVsStoredV1 === 0 && Math.abs(fusedR5 - (smoke.lockedFinalFitFusedR5 as number)) < 1e-12 && Math.abs((smoke.gainOverGlobal as number) - (smoke.lockedFinalFitGain as number)) < 1e-12;
}
if (mode === "smoke-10k") {
  let identical = 0;
  for (const [j, q] of qs.entries()) {
    const f2 = await executeFusionPlan(F, q.question, reps, { plan: { id: "fusion", version: 1 }, cache: true });
    if (JSON.stringify(rankedDocIds(f2.items, toOriginal)) === JSON.stringify(records[j].fusion.ranking)) identical++;
  }
  smoke.deterministicReexecutions = identical;
  smoke.budgetViolations = records.filter((r) => r.fusion.tokens > r.fusion.budget).length;
  smoke.reproduced = identical === qs.length && smoke.budgetViolations === 0 && records.every((r) => r.primaryBranchEqualsGlobal);
}

// ---------------- measured latency pass (caches bypassed, models warm) ----------------
const latency = [];
if (mode !== "smoke-2k") {
  await warmModels({ embed: true, rerank: true });
  for (const q of qs) {
    const s = performance.now();
    await executePlan(G, q.question, gReps, { plan: { id: "global", version: 1 }, cache: false });
    const globalMs = performance.now() - s;
    const f = await executeFusionPlan(F, q.question, reps, { plan: { id: "fusion", version: 1 }, cache: false });
    latency.push({ id: q.id, globalMs, ...f.latency });
  }
  log("latency pass done");
}

fs.writeFileSync(
  outFile,
  JSON.stringify({
    label: mode === "heldout" ? "V1.1B EnterpriseRAG held-out evaluation (locked systems, run once)" : `SMOKE TEST (${mode}) on optimization questions — not a result`,
    mode,
    lockCommit: LOCK_COMMIT,
    codeCommit: git("rev-parse", "HEAD").trim(),
    heldOutLabelsRead,
    n: qs.length,
    scale,
    datasetVersion: version,
    systems: { global: lock.systems.globalFixed.key, fusion: lock.systems.fusionContextPlan.key },
    smoke,
    records,
    latency,
    resources: { totalSec: Math.round((Date.now() - t0) / 1000), peakRssSampled500msMB: Math.round(peakRss / 1048576) },
  }),
);
log("DONE", JSON.stringify(smoke));
