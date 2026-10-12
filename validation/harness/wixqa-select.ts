/**
 * WixQA selection (280 optimization questions only) → selection lock.
 * Same frozen selection procedure as the earlier locked evaluations. Question text and gold of
 * optimization questions only; held-out questions are dropped on load.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Metrics, PlanConfig, TrialSummary } from "@/core/domain";
import { aggregate, type Outcome } from "@/engine/evaluate";
import { selectConfig } from "@/engine/optimizer/selection";
import { enumerateSpace } from "@/engine/optimizer/space";
import { planKey, describePlan } from "@/engine/labels";
import { demoRouter, resolvePlanClass } from "@/engine/router";
import { assertFrozen } from "./freeze";
import { SEED } from "./env";
import { learnPlans, selectOn, type QOutcome, type SearchResult } from "./select";
import { loadPrimaryQuestions, toHarnessQuestions } from "./datasets/wixqa";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const frozen = assertFrozen();
const W = "validation/work/wixqa";

const splitRaw = fs.readFileSync("validation/splits/wixqa.json");
const split = JSON.parse(splitRaw.toString()) as { questions: { questionId: string; split: "optimization" | "validation" }[] };
const questions = toHarnessQuestions(await loadPrimaryQuestions(), split.questions).filter((q) => q.split === "optimization");
if (questions.length !== 280) throw new Error(`expected 280 optimization questions, got ${questions.length}`);

const searchRaw = fs.readFileSync(`${W}/v1-full/search.json`);
const s = JSON.parse(searchRaw.toString()) as { datasetVersion: string; baselineKey: string; trials: TrialSummary[]; routedClass: Record<string, string>; outcomes: Record<string, Record<string, QOutcome>> };
const space = enumerateSpace();
const spaceKeys = space.map(planKey);
if (s.trials.map((t) => t.key).join("\n") !== spaceKeys.join("\n")) throw new Error("search space differs from frozen enumerateSpace()");
const outcomes = new Map(spaceKeys.map((k) => [k, new Map(Object.entries(s.outcomes[k]))]));
const routedClass = new Map(Object.entries(s.routedClass));
for (const q of questions) {
  if (spaceKeys.some((k) => !outcomes.get(k)!.has(q.id))) throw new Error(`missing outcome for ${q.id}`);
  if (routedClass.get(q.id) !== demoRouter.route(q.question).class) throw new Error(`routed class mismatch for ${q.id}`);
}
const res: SearchResult = {
  questions,
  trials: s.trials,
  outcomes,
  routedClass,
  baselineKey: s.baselineKey,
  calibration: { embedQueryMs: 0, rerankPerPairMs: 0, method: "not used for selection" },
  chunks: {},
  distinctBehaviors: 0,
  timings: { representMs: 0, searchMs: 0 },
};

const sys = (name: string, config: PlanConfig, m: Metrics) => ({ name, planKey: planKey(config), config, description: describePlan(config).join(" · "), optimization: m });
const family = {
  A: (c: PlanConfig) => c.retrievalStrategy === "lexical" && !c.exactMatchBoost && c.graphStrategy === "none" && c.reranker === "none",
  B: (c: PlanConfig) => c.retrievalStrategy === "vector" && c.embeddingModel === "minilm-l6" && !c.exactMatchBoost && c.graphStrategy === "none" && c.reranker === "none",
  C: (c: PlanConfig) => c.retrievalStrategy === "hybrid" && c.embeddingModel === "minilm-l6" && !c.exactMatchBoost && c.graphStrategy === "none" && c.reranker === "none",
  D: (c: PlanConfig) => c.retrievalStrategy === "hybrid" && c.embeddingModel === "minilm-l6" && !c.exactMatchBoost && c.graphStrategy === "none" && c.reranker === "cross-encoder",
};
const fixed: Record<string, ReturnType<typeof sys>> = {};
for (const objective of ["quality", "balanced"] as const) {
  const e = selectOn(res, questions, "*", objective);
  fixed[`E_globalFixed_${objective}`] = sys(`Best Global Fixed (${objective})`, e.config, e.metrics);
}
for (const [f, pred] of Object.entries(family)) {
  const sel = selectOn(res, questions, "*", "quality", {}, pred);
  fixed[f] = sys(`Baseline ${f} (quality)`, sel.config, sel.metrics);
}
const radar: Record<string, unknown> = {};
for (const objective of ["quality", "balanced"] as const) {
  const p = learnPlans(res, demoRouter, objective);
  const optRoute: Record<string, number> = {};
  for (const q of questions) {
    const cls = resolvePlanClass(demoRouter.route(q.question), p.classes.map((c) => c.questionClass), demoRouter.fallbackThreshold);
    optRoute[cls] = (optRoute[cls] ?? 0) + 1;
  }
  radar[`RadarDB_${objective}`] = {
    name: `RadarDB ContextPlans (${objective})`,
    planSetVersion: `wixqa-full-${objective}-v1`,
    fallback: { planId: `plan_wixqa_${objective}_fallback`, ...sys("fallback", p.fallback.config, p.fallback.metrics) },
    classPlans: p.classes.map((c) => ({ planId: `plan_wixqa_${objective}_${c.questionClass}`, questionClass: c.questionClass, optimizationQuestions: c.questions, ...sys(c.questionClass, c.config, c.metrics) })),
    optimizationRoutedMetrics: p.routed,
    optimizationPlanDistribution: optRoute,
  };
}
// Baseline F (OUTSIDE RADARDB): bge-small (fallback, triggered at full by bge-base EMBEDDING_TIME_LIMIT), 12 configurations.
const fRaw = fs.readFileSync(`${W}/F-bge-small-full/f-search.json`);
const f = JSON.parse(fRaw.toString()) as { results: Record<string, Record<string, Outcome>> };
const fCands = Object.keys(f.results)
  .sort()
  .map((k) => ({ key: k, config: {} as PlanConfig, m: aggregate(questions.map((q) => ({ ...f.results[k][q.id], estimatedCostUsd: 0, estimatedLatencyMs: 0 }))) }));
const fSel = selectConfig(fCands, "quality", {}, fCands[0].m);
const [fChunking, fK] = fSel.winner.key.split("|");
const baselineF = {
  name: "Baseline F — OUTSIDE RADARDB (bge-small-en-v1.5, preregistered fallback)",
  model: "Xenova/bge-small-en-v1.5",
  dtype: "q8",
  pooling: "cls",
  fallbackTrigger: "bge-base-en-v1.5 WixQA full: RESOURCE_LIMIT_FAILURE / EMBEDDING_TIME_LIMIT (wixqa-baselineF-feasibility-bge-base-full.json)",
  queryEmbedding: "batches of 32 over the split question list in task order (as at selection; DEVIATIONS 2026-10-02)",
  chunking: fChunking,
  topK: Number(fK.slice(1)),
  key: fSel.winner.key,
  optimization: fSel.winner.m,
};

const het = JSON.parse(fs.readFileSync("validation/results/wixqa-heterogeneity-full.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync(`${W}/manifest-full.json`, "utf8")) as { sha256: string; gold: number; goldDensity: number };
const lock = {
  label: "WixQA SELECTION LOCK — selections from optimization questions only (n=280). Held-out labels read: 0.",
  createdAt: new Date().toISOString(),
  frozenEngine: { commit: "a2464f5800cb200b219bef55b5534271e2584ff8", srcSha256: frozen.srcSha256, harnessHead: frozen.commit },
  candidateSpace: { configurations: spaceKeys.length, sha256: sha(spaceKeys.join("\n")) },
  split: { file: "validation/splits/wixqa.json", sha256: sha(splitRaw), optimization: 280, heldOut: split.questions.length - 280, seed: SEED },
  dataset: {
    revision: "d662dc42479c14e202eccd832f8c4b66a035c4cc",
    scale: "full (6,221 articles)",
    datasetVersion: s.datasetVersion,
    manifestSha256: manifest.sha256,
    goldArticles: manifest.gold,
    goldDensity: manifest.goldDensity,
    searchJsonSha256: sha(searchRaw),
    fSearchJsonSha256: sha(fRaw),
  },
  routing: { router: demoRouter.version, fallbackThreshold: demoRouter.fallbackThreshold, minClassQuestions: 3, classes: demoRouter.classes.map((c) => c.id) },
  objectives: { primary: "quality", secondary: "balanced (E and RadarDB only)" },
  primary: { comparison: "RadarDB_quality vs E_globalFixed_quality", metric: "pooled question-level held-out Recall@5", n: 120, bootstrap: { resamples: 10000, seed: SEED }, success: ">= +5.0 pts AND 95% CI excludes 0" },
  oracleRouting: "not applicable: WixQA has no question-category field",
  systems: { ...fixed, ...radar, baselineF },
  heterogeneityStateOptimizationOnly: {
    source: "validation/results/wixqa-heterogeneity-full.json (DIAGNOSTIC ONLY; never used for selection)",
    globalRecall5: het.item1_globalFixed.r5,
    questionsRoutedDifferently: { count: -1, of: 280 }, // filled below
    uniqueEffectivePlansQuality: het.item2_3_classPlans.quality.uniqueEffectivePlans,
    otherConfigBeatsGlobal: het.item5_fractionOutperformed.count,
    oracleRecall5: het.item7_oraclePerQuestion_DIAGNOSTIC.r5,
    oracleGapPts: het.item8_oracleGap_DIAGNOSTIC.oracleMinusGlobalPts,
    radarRoutingCvDeltaPts: het.item10_crossValidatedSpecialization.partitions["rules-v1"].gainPts,
    radarRoutingCvCi95Pts: het.item10_crossValidatedSpecialization.partitions["rules-v1"].ci95Pts,
    globalRankByRecall5InSample: 33,
    lengthTercileCv: "+4.4 pts [+1.6, +7.3]; did not replicate in post-hoc check; NOT used in V1 or this lock",
  },
  preRegisteredExpectation: "H1 is unlikely to succeed (out-of-fold rules-v1 routing −2.8 pts on optimization data). This expectation comes only from optimization data; the held-out test is run regardless, with the unchanged criterion.",
  verification: { heldOutLabelsRead: 0, searchSpaceMatchesFrozen: true, srcUnchanged: true, benchmarkInformedModifications: "none" },
};
// Questions routed to a non-global configuration under the quality plan set.
const rq = radar.RadarDB_quality as { fallback: { planKey: string }; classPlans: { questionClass: string; planKey: string }[]; optimizationPlanDistribution: Record<string, number> };
const gKey = fixed.E_globalFixed_quality.planKey;
const routedAway = Object.entries(rq.optimizationPlanDistribution).reduce((a, [cls, n]) => a + ((cls === "*" ? rq.fallback.planKey : rq.classPlans.find((c) => c.questionClass === cls)!.planKey) !== gKey ? n : 0), 0);
lock.heterogeneityStateOptimizationOnly.questionsRoutedDifferently = { count: routedAway, of: 280 };
fs.writeFileSync("validation/results/wixqa-selection-lock.json", JSON.stringify(lock, null, 2));
console.log(JSON.stringify({ E: gKey, Eb: fixed.E_globalFixed_balanced.planKey, A: fixed.A.planKey, B: fixed.B.planKey, C: fixed.C.planKey, D: fixed.D.planKey, radarQ: rq.classPlans.map((c) => `${c.questionClass}=${c.planKey}`), radarQfallback: rq.fallback.planKey, dist: rq.optimizationPlanDistribution, routedAway, F: baselineF.key, het: lock.heterogeneityStateOptimizationOnly }, null, 1));
