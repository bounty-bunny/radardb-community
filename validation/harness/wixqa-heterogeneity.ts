/**
 * WixQA CONFIGURATION_HETEROGENEITY diagnostic (WIXQA_PROTOCOL_ADDENDUM.md §B).
 * OPTIMIZATION QUESTIONS ONLY. Oracle quantities are DIAGNOSTIC ONLY: never
 * used for plan selection, never reported as RadarDB performance.
 */
import fs from "node:fs";
import type { TrialSummary } from "@/core/domain";
import { planKey } from "@/engine/labels";
import { demoRouter, resolvePlanClass } from "@/engine/router";
import { enumerateSpace } from "@/engine/optimizer/space";
import { assertFrozen } from "./freeze";
import { SEED } from "./env";
import { rng, shuffle, readJson } from "./datasets/enterpriserag";
import { loadArticles, loadPrimaryQuestions, toHarnessQuestions } from "./datasets/wixqa";
import { learnPlans, selectOn, type QOutcome, type SearchResult } from "./select";
import { rankMetrics, type HarnessQuestion } from "./scorers";

const frozen = assertFrozen();
const SCALE = process.argv[2] ?? "full";
const search = readJson<{ datasetVersion: string; baselineKey: string; trials: TrialSummary[]; routedClass: Record<string, string>; outcomes: Record<string, Record<string, QOutcome>> }>(`validation/work/wixqa/v1-${SCALE}/search.json`);
const splitFile = readJson<{ questions: { questionId: string; split: "optimization" | "validation"; group: string; subset: string }[] }>("validation/splits/wixqa.json");
const questions = toHarnessQuestions(await loadPrimaryQuestions(), splitFile.questions).filter((q) => q.split === "optimization");
if (questions.length !== 280 || questions.some((q) => q.split !== "optimization")) throw new Error("HOLDOUT ISOLATION");
const meta = new Map(splitFile.questions.map((s) => [s.questionId, s]));
const typeOf = new Map((await loadArticles()).map((a) => [a.id, a.articleType]));

const space = enumerateSpace();
const keys = space.map(planKey);
if (search.trials.map((t) => t.key).join("\n") !== keys.join("\n")) throw new Error("search space differs from frozen enumerateSpace()");
const outcomes = new Map(keys.map((k) => [k, new Map(Object.entries(search.outcomes[k]))]));
for (const q of questions) if (keys.some((k) => !outcomes.get(k)!.has(q.id))) throw new Error(`missing outcome ${q.id}`);
const routedClass = new Map(Object.entries(search.routedClass));
const mkRes = (qs: HarnessQuestion[]): SearchResult => ({
  questions: qs,
  trials: search.trials,
  outcomes,
  routedClass,
  baselineKey: search.baselineKey,
  calibration: { embedQueryMs: 0, rerankPerPairMs: 0, method: "not used" },
  chunks: {},
  distinctBehaviors: 0,
  timings: { representMs: 0, searchMs: 0 },
});
const res = mkRes(questions);

// Per-question Recall@5 matrix.
const R5 = new Map<string, Map<string, number>>();
for (const k of keys) R5.set(k, new Map(questions.map((q) => [q.id, rankMetrics(outcomes.get(k)!.get(q.id)!.ranking ?? [], q.goldDocIds!).recall5])));
const r5 = (k: string, q: string) => R5.get(k)!.get(q)!;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pooledR5 = (k: string, qs = questions) => mean(qs.map((q) => r5(k, q.id)));
const pts = (x: number) => Number((x * 100).toFixed(2));

// 1–3. Global fixed and frozen class plans.
const G = selectOn(res, questions, "*", "quality");
const gKey = planKey(G.config);
const plans = Object.fromEntries(
  (["quality", "balanced"] as const).map((obj) => {
    const p = learnPlans(res, demoRouter, obj);
    const entries = [{ cls: "fallback", key: planKey(p.fallback.config), n: p.fallback.questions }, ...p.classes.map((c) => ({ cls: c.questionClass, key: planKey(c.config), n: c.questions }))];
    const routedKeys = questions.map((q) => {
      const cls = resolvePlanClass(demoRouter.route(q.question), p.classes.map((c) => c.questionClass), demoRouter.fallbackThreshold);
      return cls === "*" ? planKey(p.fallback.config) : planKey(p.classes.find((c) => c.questionClass === cls)!.config);
    });
    return [
      obj,
      {
        plans: entries.map((e) => ({ ...e, sameAsGlobal: e.key === (obj === "quality" ? gKey : planKey(selectOn(res, questions, "*", "balanced").config)), r5InClass: e.cls === "fallback" ? null : pts(pooledR5(e.key, questions.filter((q) => routedClass.get(q.id) === e.cls))) })),
        uniqueEffectivePlans: new Set(entries.map((e) => e.key)).size,
        uniqueConfigsActuallyRouted: new Set(routedKeys).size,
        routedR5: pts(mean(questions.map((q, i) => r5(routedKeys[i], q.id)))),
      },
    ];
  }),
);

// 4–8. Per-question bests and oracles (DIAGNOSTIC).
const best = questions.map((q) => {
  const m = Math.max(...keys.map((k) => r5(k, q.id)));
  const argmax = keys.filter((k) => r5(k, q.id) === m);
  const canonical = [...argmax].sort((a, b) => pooledR5(b) - pooledR5(a) || (a < b ? -1 : 1))[0];
  return { q: q.id, max: m, g: r5(gKey, q.id), argmax: argmax.length, gOptimal: argmax.includes(gKey), canonical };
});
const improved = best.filter((b) => b.max > b.g + 1e-12);
const gains = improved.map((b) => b.max - b.g).sort((a, b) => a - b);
const DIMS = ["chunking", "retrieval", "embedding", "exactBoost", "graph", "reranker", "topK"];
const countBy = (xs: string[]) => Object.fromEntries(Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]));
const canonicalImproved = improved.map((b) => b.canonical);
const byDim = Object.fromEntries(DIMS.map((d, i) => [d, { global: gKey.split("|")[i], amongImprovedQuestions: countBy(canonicalImproved.map((k) => k.split("|")[i])) }]));
const oracle = mean(best.map((b) => b.max));
const portfolioValue = (set: string[]) => mean(questions.map((q) => Math.max(...set.map((k) => r5(k, q.id)))));
const portfolio: { size: number; added: string; r5: number }[] = [{ size: 1, added: gKey, r5: pts(pooledR5(gKey)) }];
let port = [gKey];
for (let size = 2; size <= 5; size++) {
  let bestK = "";
  let bestV = -1;
  for (const k of keys) {
    if (port.includes(k)) continue;
    const v = portfolioValue([...port, k]);
    if (v > bestV + 1e-12 || (Math.abs(v - bestV) <= 1e-12 && k < bestK)) {
      bestV = v;
      bestK = k;
    }
  }
  port = [...port, bestK];
  portfolio.push({ size, added: bestK, r5: pts(bestV) });
}

// 9. By metadata.
const lens = questions.map((q) => q.question.length).sort((a, b) => a - b);
const t1 = lens[Math.floor(lens.length / 3)];
const t2 = lens[Math.floor((2 * lens.length) / 3)];
const partitions: Record<string, { queryTime: boolean; of: (q: HarnessQuestion) => string }> = {
  routerClass: { queryTime: true, of: (q) => routedClass.get(q.id)! },
  lengthTercile: { queryTime: true, of: (q) => (q.question.length < t1 ? "short" : q.question.length < t2 ? "medium" : "long") },
  subset: { queryTime: false, of: (q) => meta.get(q.id)!.subset },
  goldArticleType: { queryTime: false, of: (q) => [...new Set(q.goldDocIds!.map((g) => typeOf.get(g)!))].sort().join("+") },
  goldCount: { queryTime: false, of: (q) => String(q.goldDocIds!.length) },
};
const byMetadata = Object.fromEntries(
  Object.entries(partitions).map(([name, p]) => {
    const cells = [...new Set(questions.map(p.of))].sort();
    return [
      name,
      {
        availableAtQueryTime: p.queryTime,
        cells: cells.map((c) => {
          const qs = questions.filter((q) => p.of(q) === c);
          const cellBest = keys.reduce((b, k) => (pooledR5(k, qs) > pooledR5(b, qs) + 1e-12 ? k : b), gKey);
          const sel = qs.length >= 3 ? planKey(selectOn(res, qs, c, "quality").config) : null;
          return { cell: c, n: qs.length, r5Global: pts(pooledR5(gKey, qs)), inSampleBestR5: { key: cellBest, r5: pts(pooledR5(cellBest, qs)) }, frozenSelectionQuality: sel, frozenSelectionSameAsGlobal: sel === gKey, frozenSelectionR5: sel ? pts(pooledR5(sel, qs)) : null };
        }),
      },
    ];
  }),
);

// 10. 5-fold grouped cross-validation of specialization (within optimization only).
const groupList = shuffle([...new Set(questions.map((q) => meta.get(q.id)!.group))].sort(), rng(SEED));
const foldOfGroup = new Map<string, number>();
const foldSize = [0, 0, 0, 0, 0];
const gsize = (g: string) => questions.filter((q) => meta.get(q.id)!.group === g).length;
for (const g of groupList) {
  const f = foldSize.indexOf(Math.min(...foldSize));
  foldOfGroup.set(g, f);
  foldSize[f] += gsize(g);
}
const foldOf = (q: HarnessQuestion) => foldOfGroup.get(meta.get(q.id)!.group)!;
const cvPred = (name: string): Map<string, { spec: string; glob: string }> => {
  const out = new Map<string, { spec: string; glob: string }>();
  for (let f = 0; f < 5; f++) {
    const train = questions.filter((q) => foldOf(q) !== f);
    const test = questions.filter((q) => foldOf(q) === f);
    const tr = mkRes(train);
    const glob = planKey(selectOn(tr, train, "*", "quality").config);
    if (name === "rules-v1") {
      const p = learnPlans(tr, demoRouter, "quality");
      for (const q of test) {
        const cls = resolvePlanClass(demoRouter.route(q.question), p.classes.map((c) => c.questionClass), demoRouter.fallbackThreshold);
        out.set(q.id, { spec: cls === "*" ? planKey(p.fallback.config) : planKey(p.classes.find((c) => c.questionClass === cls)!.config), glob });
      }
    } else {
      const of = partitions[name].of;
      const cells = [...new Set(questions.map(of))];
      const p = learnPlans(tr, demoRouter, "quality", { classOf: of, classIds: cells });
      const planFor = new Map(p.classes.map((c) => [c.questionClass, planKey(c.config)]));
      for (const q of test) out.set(q.id, { spec: planFor.get(of(q)) ?? planKey(p.fallback.config), glob });
    }
  }
  return out;
};
const bootstrap = (d: number[]) => {
  const rand = rng(SEED);
  const bs: number[] = [];
  for (let i = 0; i < 10000; i++) {
    let s = 0;
    for (let j = 0; j < d.length; j++) s += d[Math.floor(rand() * d.length)];
    bs.push(s / d.length);
  }
  bs.sort((a, b) => a - b);
  return [bs[250], bs[9749]];
};
const cv = Object.fromEntries(
  ["rules-v1", ...Object.keys(partitions)].map((name) => {
    const pred = cvPred(name);
    const d = questions.map((q) => r5(pred.get(q.id)!.spec, q.id) - r5(pred.get(q.id)!.glob, q.id));
    const ci = bootstrap(d);
    return [
      name,
      {
        availableAtQueryTime: name === "rules-v1" || (partitions[name]?.queryTime ?? false),
        specializedR5: pts(mean(questions.map((q) => r5(pred.get(q.id)!.spec, q.id)))),
        globalR5: pts(mean(questions.map((q) => r5(pred.get(q.id)!.glob, q.id)))),
        gainPts: pts(mean(d)),
        ci95Pts: ci.map(pts),
        questionsWithDifferentConfig: questions.filter((q) => pred.get(q.id)!.spec !== pred.get(q.id)!.glob).length,
        wins: d.filter((x) => x > 1e-12).length,
        losses: d.filter((x) => x < -1e-12).length,
      },
    ];
  }),
);

const complementaryCapacity = portfolio[1].r5 - portfolio[0].r5 >= 5.0;
const learnable = Object.values(cv).some((c) => c.availableAtQueryTime && c.gainPts >= 2.0 && c.ci95Pts[0] > 0);
const anyCvGain2 = Object.values(cv).some((c) => c.gainPts >= 2.0);
const report = {
  label: "WixQA CONFIGURATION_HETEROGENEITY — OPTIMIZATION QUESTIONS ONLY (n=280); oracle values are DIAGNOSTIC ONLY, never RadarDB performance; held-out labels read: 0",
  createdAt: new Date().toISOString(),
  frozen,
  scale: SCALE,
  datasetVersion: search.datasetVersion,
  n: questions.length,
  heldOutLabelsRead: 0,
  item1_globalFixed: { key: gKey, r5: pts(pooledR5(gKey)), coverage: pts(G.metrics.evidenceCoverage), success: pts(G.metrics.retrievalSuccess), tokens: Math.round(G.metrics.contextTokens) },
  item2_3_classPlans: plans,
  item4_perQuestionBest: {
    questionsWhereGlobalIsOptimal: best.filter((b) => b.gOptimal).length,
    argmaxSetSize: { median: [...best.map((b) => b.argmax)].sort((a, b) => a - b)[best.length >> 1], questionsWithAll480Tied: best.filter((b) => b.argmax === 480).length },
    questionsWhereNoConfigFindsGold: best.filter((b) => b.max === 0).length,
    canonicalBestAmongImproved: countBy(canonicalImproved),
    canonicalBestByDimensionAmongImproved: byDim,
  },
  item5_fractionOutperformed: { count: improved.length, of: questions.length, fraction: Number((improved.length / questions.length).toFixed(4)) },
  item6_magnitude: { meanPts: pts(mean(gains)), medianPts: pts(gains[gains.length >> 1] ?? 0), histogram: countBy(gains.map((g) => g.toFixed(2))) },
  item7_oraclePerQuestion_DIAGNOSTIC: { r5: pts(oracle) },
  item8_oracleGap_DIAGNOSTIC: { oracleMinusGlobalPts: pts(oracle - pooledR5(gKey)), greedyPortfolio: portfolio },
  item9_byMetadata: byMetadata,
  item10_crossValidatedSpecialization: { folds: 5, foldSizes: foldSize, groupedBy: "split group", objective: "quality (frozen selectConfig)", bootstrap: { resamples: 10000, seed: SEED }, partitions: cv },
  verdict: { COMPLEMENTARY_CAPACITY: complementaryCapacity, LEARNABLE_SPECIALIZATION: learnable, anyCvGainAtLeast2Pts: anyCvGain2, meaningfulComplementaryConfigurations: complementaryCapacity && anyCvGain2 },
};
fs.writeFileSync(`validation/results/wixqa-heterogeneity-${SCALE}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
