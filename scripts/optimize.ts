/**
 * Headless optimizer run against the workspace in RADAR_DATA_DIR (default .radar/).
 *   npm run optimize -- [balanced|quality|cost|latency] [--deploy]
 * Prints optimization-set and held-out results separately.
 */
import { control } from "@/server/control";
import { classLabel } from "@/engine/router";
import { describePlan } from "@/engine/labels";
import type { Metrics, Objective } from "@/core/domain";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (m: Metrics) =>
  `coverage ${pct(m.evidenceCoverage).padStart(6)}  success ${pct(m.retrievalSuccess).padStart(6)} [${pct(m.retrievalSuccessCI[0])}–${pct(
    m.retrievalSuccessCI[1],
  )}]  precision ${pct(m.contextPrecision).padStart(6)}  ${Math.round(m.contextTokens)} tok  est $${m.estimatedCostUsd.toFixed(5)}  est ${m.estimatedLatencyMs.toFixed(1)} ms  (n=${m.n})`;

async function main() {
  const objective = (process.argv.find((a) => ["balanced", "quality", "cost", "latency"].includes(a)) ?? "balanced") as Objective;
  const cp = await control();
  const t0 = Date.now();
  const run = cp.startRun({ objective, constraints: {}, strategy: "exhaustive" });
  let last = "";
  const timer = setInterval(() => {
    const p = `${run.progress.stage} ${run.progress.done}/${run.progress.total}`;
    if (p !== last) console.log(p);
    last = p;
  }, 5000);
  await cp.waitForRun();
  clearInterval(timer);
  if (run.status !== "completed") throw new Error(run.error ?? run.status);

  const rel = cp.state.releases.find((r) => r.id === run.candidateReleaseId)!;
  console.log(`\nrun ${run.id} in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${run.configurationsTested} configs · ${run.distinctBehaviors} distinct behaviors · dataset ${run.datasetVersion}`);
  console.log("calibration:", run.calibration);
  console.log("integrity passed:", run.integrity?.passed, "| near-dup across splits:", run.integrity?.nearDuplicatesAcrossSplits.length);
  console.log("\nOPTIMIZATION SET (used for selection)");
  console.log("  typical ", fmt(rel.optimization.baseline));
  console.log("  radardb ", fmt(rel.optimization.metrics));
  if (rel.validation) {
    console.log("\nHELD-OUT VALIDATION (never used for selection)");
    console.log("  typical ", fmt(rel.validation.baseline));
    console.log("  radardb ", fmt(rel.validation.metrics));
    const l = rel.validation.measuredLatency;
    const b = rel.validation.baselineMeasuredLatency;
    if (l && b) console.log(`  measured latency p50/p95: typical ${b.p50.toFixed(1)}/${b.p95.toFixed(1)} ms · radardb ${l.p50.toFixed(1)}/${l.p95.toFixed(1)} ms`);
    for (const [cls, v] of Object.entries(rel.validation.perClass))
      console.log(`  ${classLabel(cp.router, cls).padEnd(11)} coverage ${pct(v.baseline.evidenceCoverage)} → ${pct(v.metrics.evidenceCoverage)} (n=${v.metrics.n})`);
  }
  console.log(`\nrelease v${rel.version} (${rel.status})`);
  for (const p of cp.plansOf(rel))
    console.log(`  ${classLabel(cp.router, p.questionClass).padEnd(11)} ${describePlan(p.config).join(" · ")}  [confidence ${p.confidence.level}]`);
  if (process.argv.includes("--deploy")) {
    cp.deploy(rel.id);
    console.log(`\ndeployed release v${rel.version}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
