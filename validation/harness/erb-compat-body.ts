/**
 * EnterpriseRAG compatibility run (PREREGISTRATION §12 step 5).
 * Reports ONLY plumbing, product-limit fit, resources, router distribution
 * (question text only), and stop checks S6/S7. It does not evaluate held-out
 * questions and does not compare systems.
 */
import fs from "node:fs";
import path from "node:path";
import { ExhaustiveSearch } from "@/engine/optimizer/strategies";
import { BASELINE_CONFIG, enumerateSpace } from "@/engine/optimizer/space";
import { datasetVersionOf } from "@/engine/representations";
import { demoRouter, resolvePlanClass } from "@/engine/router";
import { planKey } from "@/engine/labels";
import type { PlanConfig } from "@/core/domain";
import { assertFrozen } from "./freeze";
import { ResourceMonitor, dirBytes } from "./monitor";
import { documentRelevanceScorer, rankMetrics, rankedDocIds } from "./scorers";
import { search, selectOn } from "./select";
import { loadCorpus, loadQuestions, readJson, toHarnessQuestions, type Manifest, type SplitRecord } from "./datasets/enterpriserag";

const ROOT = process.env.RADAR_ROOT!;
const scale = Number(process.argv[2] ?? 2000);
const work = process.cwd();
const frozen = assertFrozen(ROOT);
const mon = new ResourceMonitor();
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const manifest = readJson<Manifest>(path.join(ROOT, `validation/work/enterpriserag/manifest-${scale}.json`));
const split = readJson<{ questions: SplitRecord[] }>(path.join(ROOT, "validation/splits/enterpriserag.json")).questions;
const all = toHarnessQuestions(await loadQuestions(), split);
const opt = all.filter((q) => q.split === "optimization");
const held = all.filter((q) => q.split === "validation");

// ---- ingestion ----
let t = performance.now();
const { documents, toOriginal } = await loadCorpus(manifest);
const ingestionSec = (performance.now() - t) / 1000;
const chars = documents.reduce((s, d) => s + d.content.length, 0);
const dataset = { version: datasetVersionOf(documents), documents };
const productLimits = { documents: documents.length <= 2000, characters: chars <= 20_000_000, questions: all.length <= 500 };
log(`ingested ${documents.length} docs, ${(chars / 1e6).toFixed(1)}M chars in ${ingestionSec.toFixed(1)}s; product limits`, productLimits);

// ---- router distribution (question text only; no labels) ----
const optClasses = new Map<string, number>();
for (const q of opt) optClasses.set(demoRouter.route(q.question).class, (optClasses.get(demoRouter.route(q.question).class) ?? 0) + 1);
const learnable = [...optClasses].filter(([, n]) => n >= 3).map(([c]) => c);
const heldPlan = new Map<string, number>();
for (const q of held) {
  const c = resolvePlanClass(demoRouter.route(q.question), learnable, demoRouter.fallbackThreshold);
  heldPlan.set(c, (heldPlan.get(c) ?? 0) + 1);
}
const maxShare = Math.max(...heldPlan.values()) / held.length;
const routerCollapse = maxShare >= 0.8 || learnable.length < 2;
log("router: optimization classes", Object.fromEntries(optClasses), "held-out plan distribution", Object.fromEntries(heldPlan), "ROUTER_COLLAPSE", routerCollapse);

// ---- search on optimization questions (all 480 configurations) ----
const expFile = path.join(work, "experiments.jsonl");
fs.writeFileSync(expFile, "");
const expStream = fs.createWriteStream(expFile, { flags: "a" });
let lastStage = "";
t = performance.now();
const res = await search({
  dataset,
  questions: opt,
  router: demoRouter,
  strategy: new ExhaustiveSearch(),
  baselineConfig: BASELINE_CONFIG,
  space: enumerateSpace(),
  scorer: documentRelevanceScorer(toOriginal),
  rankOf: (items) => rankedDocIds(items, toOriginal),
  onProgress: (stage, done, total) => {
    const s = `${stage} ${done}/${total}`;
    if (stage !== lastStage || done % 40 === 0) log(s, `rss ${Math.round(mon.sample() / 1048576)}MB`);
    lastStage = stage;
  },
  onExperiment: (row) => expStream.write(JSON.stringify(row) + "\n"),
});
expStream.end();
const optimizerSec = (performance.now() - t) / 1000;

// ---- S7: Baseline A optimization-set Recall@5 (no held-out data) ----
const isA = (c: PlanConfig) => c.retrievalStrategy === "lexical" && !c.exactMatchBoost && c.graphStrategy === "none" && c.reranker === "none";
const selA = selectOn(res, res.questions, "*", "quality", {}, isA);
const aKey = planKey(selA.config);
const aRecall5 =
  res.questions.reduce((s, q) => s + rankMetrics(res.outcomes.get(aKey)!.get(q.id)!.ranking!, q.goldDocIds!).recall5, 0) / res.questions.length;
const s7Ceiling = aRecall5 >= 0.95;

// Persist the search so comparative steps don't redo it (optimization data only).
const searchFile = path.join(work, "search.json");
fs.writeFileSync(
  searchFile,
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

const resources = mon.stop();
const report = {
  test: "enterpriserag-compatibility",
  label: "External benchmark relevance scoring — compatibility run (no held-out evaluation, no system comparison)",
  scale,
  frozen,
  corpus: { documents: documents.length, characters: chars, gold: manifest.gold, goldDensity: manifest.goldDensity, manifestSha256: manifest.sha256, datasetVersion: dataset.version },
  productLimits: { ...productLimits, withinAll: Object.values(productLimits).every(Boolean) },
  questions: { optimization: opt.length, heldOut: held.length },
  representations: { chunks: res.chunks, buildSec: Number((res.timings.representMs / 1000).toFixed(1)) },
  calibration: res.calibration,
  optimizer: { configurations: res.trials.length, distinctBehaviors: res.distinctBehaviors, searchSec: Number((res.timings.searchMs / 1000).toFixed(1)), totalSec: Number(optimizerSec.toFixed(1)) },
  timings: { ingestionSec: Number(ingestionSec.toFixed(1)) },
  resources: { ...resources, workDirMB: Math.round(dirBytes(work) / 1048576), embeddingCacheMB: Math.round(dirBytes(path.join(work, ".radar", "cache")) / 1048576) },
  router: {
    version: demoRouter.version,
    optimizationClassCounts: Object.fromEntries(optClasses),
    learnableClasses: learnable,
    heldOutPlanDistribution: Object.fromEntries(heldPlan),
    maxShare,
    ROUTER_COLLAPSE: routerCollapse,
  },
  stopChecks: {
    S6_ambiguousGold: { affectedQuestions: all.filter((q) => q.goldDocIds?.includes("dsid_6df52fdb96ae4edcb76464738bca3340")).length, of: all.length, triggered: false },
    S7_productCeiling: { baselineA: aKey, optimizationRecall5: aRecall5, threshold: 0.95, triggered: s7Ceiling },
  },
};
fs.mkdirSync(path.join(ROOT, "validation/results"), { recursive: true });
fs.writeFileSync(path.join(ROOT, `validation/results/enterpriserag-compat-${scale}.json`), JSON.stringify(report, null, 2));
log("DONE", JSON.stringify({ productLimits: report.productLimits, optimizer: report.optimizer, resources: report.resources, S7: report.stopChecks.S7_productCeiling, router: report.router.ROUTER_COLLAPSE }));
