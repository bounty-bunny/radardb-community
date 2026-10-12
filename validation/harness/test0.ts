/**
 * TEST 0a — reproduce the internal V1 result with the frozen product path (RadarDB V1 native scoring).
 * TEST 0b — fidelity gate: harness (RequiredEvidenceScorer) must reproduce frozen optimize()+validatePlans() exactly.
 *
 *   node --max-old-space-size=8192 node_modules/tsx/dist/cli.mjs --tsconfig validation/tsconfig.json validation/harness/test0.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EvalQuestion, Metrics, Objective } from "@/core/domain";
import { ControlPlane, seedDemo } from "@/server/control";
import { Store } from "@/server/store";
import { optimize } from "@/engine/optimizer/runner";
import { validatePlans } from "@/engine/optimizer/validate";
import { ExhaustiveSearch } from "@/engine/optimizer/strategies";
import { BASELINE_CONFIG, enumerateSpace } from "@/engine/optimizer/space";
import { datasetVersionOf } from "@/engine/representations";
import { demoRouter, resolvePlanClass } from "@/engine/router";
import { planKey } from "@/engine/labels";
import { assertFrozen } from "./freeze";
import { writeEnvironment } from "./env";
import { RequiredEvidenceScorer } from "./scorers";
import { learnPlans, search } from "./select";
import { evaluateHeldOut } from "./evaluate";

const OUT = "validation/results";
fs.mkdirSync(OUT, { recursive: true });
const frozen = assertFrozen();
const env = await writeEnvironment();
console.log("freeze ok", frozen, "| env written", env.models.embedding.hubSha);

// ---------- Test 0a: frozen product path ----------
const cp = new ControlPlane(new Store(fs.mkdtempSync(path.join(os.tmpdir(), "radar-test0-"))));
await seedDemo(cp);
const t0 = Date.now();
const run = cp.startRun({ objective: "balanced", constraints: {}, strategy: "exhaustive" });
await cp.waitForRun();
if (run.status !== "completed") throw new Error(`Test 0a run failed: ${run.error}`);
const rel = cp.state.releases.find((r) => r.id === run.candidateReleaseId)!;
const v = rel.validation!;
const pick = (m: Metrics) => ({
  evidenceCoverage: m.evidenceCoverage,
  retrievalSuccess: m.retrievalSuccess,
  contextPrecision: m.contextPrecision,
  contextTokens: m.contextTokens,
  estimatedCostUsd: m.estimatedCostUsd,
  n: m.n,
});
const expected = { typical: { cov: 0.636, prec: 0.127, tok: 1142 }, radar: { cov: 0.909, prec: 0.205, tok: 308 } };
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const reproduced =
  v.questions === 11 &&
  close(v.baseline.evidenceCoverage, expected.typical.cov, 0.001) &&
  close(v.baseline.retrievalSuccess, expected.typical.cov, 0.001) &&
  close(v.baseline.contextPrecision, expected.typical.prec, 0.001) &&
  close(v.baseline.contextTokens, expected.typical.tok, 1) &&
  close(v.metrics.evidenceCoverage, expected.radar.cov, 0.001) &&
  close(v.metrics.retrievalSuccess, expected.radar.cov, 0.001) &&
  close(v.metrics.contextPrecision, expected.radar.prec, 0.001) &&
  close(v.metrics.contextTokens, expected.radar.tok, 1);
const test0a = {
  test: "0a",
  label: "RadarDB V1 native scoring — internal synthetic benchmark, frozen product path",
  objective: "balanced",
  runtimeSec: (Date.now() - t0) / 1000,
  datasetVersion: run.datasetVersion,
  configurationsTested: run.configurationsTested,
  heldOut: { n: v.questions, typical: pick(v.baseline), radardb: pick(v.metrics) },
  optimization: { n: rel.optimization.questions, typical: pick(rel.optimization.baseline), radardb: pick(rel.optimization.metrics) },
  measuredLatency: { typical: v.baselineMeasuredLatency, radardb: v.measuredLatency },
  plans: cp.plansOf(rel).map((p) => ({ class: p.questionClass, config: planKey(p.config) })),
  expected,
  reproduced,
};
fs.writeFileSync(`${OUT}/internal-v1.json`, JSON.stringify(test0a, null, 2));
console.log(`TEST 0a reproduced=${reproduced}`, JSON.stringify(test0a.heldOut));
if (!reproduced) throw new Error("TEST 0a FAILED: frozen environment does not reproduce V1");

// ---------- Test 0b: fidelity gate ----------
const documents = cp.state.documents.slice();
const questions: EvalQuestion[] = JSON.parse(JSON.stringify(cp.state.questions));
const dataset = { version: datasetVersionOf(documents), documents };
const opt = questions.filter((q) => q.requiredEvidence.length && q.split === "optimization");
const val = questions.filter((q) => q.requiredEvidence.length && q.split === "validation");
const space = enumerateSpace();

const mismatches: string[] = [];
const eq = (what: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(`${what}: frozen=${JSON.stringify(a)} harness=${JSON.stringify(b)}`);
};
const det = (m: Metrics) => ({
  n: m.n,
  evidenceCoverage: m.evidenceCoverage,
  retrievalSuccess: m.retrievalSuccess,
  retrievalSuccessCI: m.retrievalSuccessCI,
  contextPrecision: m.contextPrecision,
  contextTokens: m.contextTokens,
  estimatedCostUsd: m.estimatedCostUsd,
});

const harnessSearch = await search({
  dataset,
  questions: opt,
  router: demoRouter,
  strategy: new ExhaustiveSearch(),
  baselineConfig: BASELINE_CONFIG,
  space,
  scorer: RequiredEvidenceScorer,
  calibrate: false,
});

const fidelity: Record<string, unknown> = {};
for (const objective of ["balanced", "quality"] as Objective[]) {
  const f = await optimize({
    runId: `fidelity-${objective}`,
    dataset,
    questions: opt,
    router: demoRouter,
    strategy: new ExhaustiveSearch(),
    objective,
    constraints: {},
    baselineConfig: BASELINE_CONFIG,
    space,
    calibrate: false,
  });
  const h = learnPlans(harnessSearch, demoRouter, objective);

  eq(`${objective}: trial count`, f.trials.length, harnessSearch.trials.length);
  f.trials.forEach((t, i) => {
    eq(`${objective}: trial ${i} key`, t.key, harnessSearch.trials[i]?.key);
    eq(`${objective}: trial ${t.key} metrics`, det(t.optimization), det(harnessSearch.trials[i]?.optimization));
    eq(`${objective}: trial ${t.key} pareto`, t.pareto, harnessSearch.trials[i]?.pareto);
  });
  eq(`${objective}: distinct behaviors`, f.distinctBehaviors, harnessSearch.distinctBehaviors);
  eq(`${objective}: baseline`, det(f.baseline), det(harnessSearch.trials.length ? learnPlans(harnessSearch, demoRouter, objective).fallback.baseline : f.baseline));
  eq(`${objective}: fallback`, planKey(f.fallback.config), planKey(h.fallback.config));
  eq(`${objective}: fallback metrics`, det(f.fallback.metrics), det(h.fallback.metrics));
  eq(`${objective}: fallback reasons`, f.fallback.explanation.reasons, h.fallback.explanation.reasons);
  eq(
    `${objective}: class plans`,
    f.classes.map((c) => [c.questionClass, planKey(c.config)]),
    h.classes.map((c) => [c.questionClass, planKey(c.config)]),
  );
  f.classes.forEach((c, i) => eq(`${objective}: class ${c.questionClass} metrics`, det(c.metrics), det(h.classes[i]?.metrics)));
  eq(`${objective}: routed optimization metrics`, det(f.routed), det(h.routed));

  // Held-out: frozen validatePlans vs harness evaluator.
  const plans = Object.fromEntries(f.classes.map((c) => [c.questionClass, c.config]));
  const fv = await validatePlans({ dataset, questions: val, router: demoRouter, plans, fallback: f.fallback.config, baselineConfig: BASELINE_CONFIG, calibration: f.calibration, measureLatency: false });
  const hPlans = Object.fromEntries(h.classes.map((c) => [c.questionClass, c.config]));
  const [hRadar, hBase] = await evaluateHeldOut({
    dataset,
    questions: val,
    scorer: RequiredEvidenceScorer,
    calibration: harnessSearch.calibration,
    measureLatency: false,
    systems: [
      {
        name: "radardb",
        resolve: (q) => {
          const cls = resolvePlanClass(demoRouter.route(q.question), Object.keys(hPlans), demoRouter.fallbackThreshold);
          return { planClass: cls, config: cls === "*" ? h.fallback.config : hPlans[cls] };
        },
      },
      { name: "baseline", resolve: () => ({ planClass: "*", config: BASELINE_CONFIG }) },
    ],
  });
  eq(`${objective}: held-out radardb`, det(fv.metrics), det(hRadar.metrics));
  eq(`${objective}: held-out baseline`, det(fv.baseline), det(hBase.metrics));
  for (const [cls, m] of Object.entries(fv.perClass)) eq(`${objective}: held-out class ${cls}`, det(m.metrics), det(hRadar.perClass[cls]));
  eq(
    `${objective}: held-out per-question success`,
    fv.perQuestion.map((p) => [p.questionId, p.planClass, p.plan.success, p.baseline.success]),
    hRadar.perQuestion.map((p, i) => [p.questionId, p.planClass, p.outcome.success, hBase.perQuestion[i].outcome.success]),
  );
  fidelity[objective] = {
    selectedFallback: planKey(f.fallback.config),
    classPlans: f.classes.map((c) => [c.questionClass, planKey(c.config)]),
    heldOut: { radardb: det(fv.metrics), typical: det(fv.baseline) },
  };
}

// Pareto flags depend on estimatedLatencyMs (wall-clock). Check whether the FROZEN engine is even self-consistent.
const frozenA = await optimize({ runId: "selfcheck-a", dataset, questions: opt, router: demoRouter, strategy: new ExhaustiveSearch(), objective: "quality", constraints: {}, baselineConfig: BASELINE_CONFIG, space, calibrate: false });
const frozenB = await optimize({ runId: "selfcheck-b", dataset, questions: opt, router: demoRouter, strategy: new ExhaustiveSearch(), objective: "quality", constraints: {}, baselineConfig: BASELINE_CONFIG, space, calibrate: false });
const frozenSelfParetoDiffs = frozenA.trials.filter((t, i) => t.pareto !== frozenB.trials[i].pareto).length;
const frozenSelfDetDiffs = frozenA.trials.filter((t, i) => JSON.stringify(det(t.optimization)) !== JSON.stringify(det(frozenB.trials[i].optimization))).length;
const paretoMismatches = mismatches.filter((m) => m.includes(" pareto:"));
const gating = mismatches.filter((m) => !m.includes(" pareto:"));
console.log(`frozen-vs-frozen: pareto flag differences ${frozenSelfParetoDiffs}/480, deterministic-metric differences ${frozenSelfDetDiffs}/480`);
console.log(`harness-vs-frozen: pareto-only mismatches ${paretoMismatches.length}, other mismatches ${gating.length}`);

const test0b = {
  test: "0b",
  paretoNote:
    "Pareto flags are computed from estimatedLatencyMs, which includes wall-clock time; they were not a preregistered fidelity field. Reported separately with the frozen engine's own run-to-run variation.",
  frozenSelfConsistency: { paretoFlagDifferences: frozenSelfParetoDiffs, deterministicMetricDifferences: frozenSelfDetDiffs },
  paretoMismatches: paretoMismatches.length,
  gatingMismatches: gating,
  label: "Harness fidelity gate (RequiredEvidenceScorer vs frozen optimize()+validatePlans())",
  comparedFields: "per-trial coverage/success/CI/precision/tokens/estimated cost, Pareto flags, distinct behaviors, selections, explanations, routed metrics, held-out metrics and per-question outcomes",
  excludedFields: "estimatedLatencyMs and measured latency (wall-clock, non-deterministic in the frozen engine itself; not used by quality/balanced selection)",
  trialsCompared: harnessSearch.trials.length,
  objectives: fidelity,
  allMismatches: mismatches,
  faithful: gating.length === 0 && frozenSelfDetDiffs === 0,
};
fs.writeFileSync(`${OUT}/fidelity.json`, JSON.stringify(test0b, null, 2));
console.log(`TEST 0b faithful=${test0b.faithful} gating mismatches=${gating.length}`);
for (const m of gating.slice(0, 20)) console.log("  ", m);
if (!test0b.faithful) process.exit(2);
