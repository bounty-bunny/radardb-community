/** WixQA Synthetic secondary-generalization analysis (locked metrics; committed before the test run). */
import fs from "node:fs";
import { rng } from "@/engine/v11/objective";

type M = { recall5: number; recall10: number; ndcg10: number; success5: boolean; tokens: number };
const r = JSON.parse(fs.readFileSync("research/v1.1/v11c/results/synthetic-test.json", "utf8")) as {
  n: number;
  heldOutLabelsRead: number;
  lockCommit: string;
  codeCommit: string;
  systems: { global: string; fusion: string };
  records: { id: string; global: M; fusion: M & { budget: number }; partnerR5: number; contributionTop5: { both: number; "primary-only": number; "partner-only": number } }[];
  latency: Record<string, number>[];
  parityMismatchesOnLatencySubsample: number;
  resources: { totalSec: number; qualitySec: number; peakRssSampled500msMB: number };
};
const audit = JSON.parse(fs.readFileSync("research/v1.1/v11c/results/synthetic-audit.json", "utf8")) as { testQuestions: { id: string; sharesGoldWithDevelopment: boolean }[] };
const sharesDev = new Map(audit.testQuestions.map((x) => [x.id, x.sharesGoldWithDevelopment]));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
function paired(rs: typeof r.records) {
  const d = rs.map((x) => x.fusion.recall5 - x.global.recall5);
  const rand = rng(20261001);
  const bs: number[] = [];
  for (let b = 0; b < 10000; b++) {
    let s = 0;
    for (let j = 0; j < d.length; j++) s += d[Math.floor(rand() * d.length)];
    bs.push(s / d.length);
  }
  bs.sort((a, b) => a - b);
  return { n: rs.length, global: mean(rs.map((x) => x.global.recall5)), fusion: mean(rs.map((x) => x.fusion.recall5)), delta: mean(d), ci: [bs[250], bs[9749]], improves: d.filter((x) => x > 1e-12).length, harms: d.filter((x) => x < -1e-12).length };
}
const rs = r.records;
const P = paired(rs);
const scientific = P.delta > 0 && P.ci[0] > 0;
const productRule = scientific && P.delta >= 0.05;
let fOnly = 0;
let gOnly = 0;
for (const x of rs) {
  if (x.fusion.success5 && !x.global.success5) fOnly++;
  if (!x.fusion.success5 && x.global.success5) gOnly++;
}
const binom = (nn: number, k: number) => {
  let v = 1;
  for (let i = 1; i <= k; i++) v = (v * (nn - k + i)) / i;
  return v;
};
let cdf = 0;
for (let i = 0; i <= Math.min(fOnly, gOnly); i++) cdf += binom(fOnly + gOnly, i) * 0.5 ** (fOnly + gOnly);
const mcP = fOnly + gOnly ? Math.min(1, 2 * cdf) : 1;
const oracle2 = mean(rs.map((x) => Math.max(x.global.recall5, x.partnerR5)));
const capture = oracle2 - P.global > 1e-12 ? (P.fusion - P.global) / (oracle2 - P.global) : null;
const contrib = rs.reduce((a, x) => ({ both: a.both + x.contributionTop5.both, g: a.g + x.contributionTop5["primary-only"], p: a.p + x.contributionTop5["partner-only"] }), { both: 0, g: 0, p: 0 });
const q = (k: string, p: number) => {
  const s = r.latency.map((l) => l[k]).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const shared = paired(rs.filter((x) => sharesDev.get(x.id)));
const unshared = paired(rs.filter((x) => !sharesDev.get(x.id)));
const summary = { primary: { ...P, scientific, productDecisionRule: productRule }, mcnemar: { fusionOnly: fOnly, globalOnly: gOnly, p: mcP }, oracle2, capture, contrib, diagnosticSplit: { sharesGoldWithDevelopment: shared, noSharedGold: unshared }, budgetViolations: rs.filter((x) => x.fusion.tokens > x.fusion.budget).length, parityMismatches: r.parityMismatchesOnLatencySubsample, resources: r.resources };
fs.writeFileSync("research/v1.1/v11c/results/synthetic-test-summary.json", JSON.stringify(summary, null, 2));

const p = (x: number) => (x * 100).toFixed(1);
const pts = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;
const L = (k: string) => `${q(k, 0.5).toFixed(0)} / ${q(k, 0.95).toFixed(0)}`;
let md = `# WixQA Synthetic secondary generalization test: FusionContextPlan vs Global Fixed\n\n`;
md += `**New questions, familiar corpus. This is not new-corpus evidence.** Locked test, run once: n = ${P.n} WixQA Synthetic questions (LLM-generated, 1 gold article each) on the 6,221-article WixQA KB. Lock \`${(r.lockCommit ?? "").slice(0, 7)}\`; run at \`${r.codeCommit.slice(0, 7)}\`. Held-out labels read: ${r.heldOutLabelsRead}. The plan was derived only from the 280 WixQA development questions and was not changed.\n\n`;
md += `**Result.** FusionContextPlan improved Recall@5 by **${pts(P.delta)} pts**, from ${p(P.global)}% to ${p(P.fusion)}%, paired 95% CI [${pts(P.ci[0])}, ${pts(P.ci[1])}] (10,000 resamples, seed 20261001).\n\n`;
md += `- Scientific rule (Δ > 0, CI excludes 0): **${scientific ? "MET" : "NOT MET"}**\n- Product decision rule (also Δ ≥ +5.0): **${productRule ? "MET" : "NOT MET"}**. The decision rule does not by itself establish that the true effect exceeds 5 points; read the CI.\n- Per question: fusion improves ${P.improves} / ties ${P.n - P.improves - P.harms} / harms ${P.harms}. Success@5 McNemar: ${fOnly} vs ${gOnly}, p = ${mcP.toExponential(2)}.\n- Two-plan oracle ${p(oracle2)}%; headroom captured ${capture == null ? "n/a" : `${(capture * 100).toFixed(0)}%`} (diagnostic).\n\n`;
md += `| Metric | Global Fixed | FusionContextPlan |\n|---|---|---|\n| Recall@5 | ${p(P.global)}% | ${p(P.fusion)}% |\n| Recall@10 | ${p(mean(rs.map((x) => x.global.recall10)))}% | ${p(mean(rs.map((x) => x.fusion.recall10)))}% |\n| nDCG@10 | ${p(mean(rs.map((x) => x.global.ndcg10)))}% | ${p(mean(rs.map((x) => x.fusion.ndcg10)))}% |\n| Success@5 | ${rs.filter((x) => x.global.success5).length} / ${P.n} | ${rs.filter((x) => x.fusion.success5).length} / ${P.n} |\n| Context tokens (mean) | ${Math.round(mean(rs.map((x) => x.global.tokens)))} | ${Math.round(mean(rs.map((x) => x.fusion.tokens)))} |\n\n`;
md += `**Gold in the top 5, by which branches retrieved it:** both ${contrib.both}, Global-only ${contrib.g}, partner-only ${contrib.p}.\n\n`;
md += `**Pre-declared diagnostic split** (gold article shared with a development question):\n\n| Split | n | Global | Fusion | Δ [95% CI] |\n|---|---|---|---|---|\n| shares gold with development | ${shared.n} | ${p(shared.global)}% | ${p(shared.fusion)}% | ${pts(shared.delta)} [${pts(shared.ci[0])}, ${pts(shared.ci[1])}] |\n| no shared gold | ${unshared.n} | ${p(unshared.global)}% | ${p(unshared.fusion)}% | ${pts(unshared.delta)} [${pts(unshared.ci[0])}, ${pts(unshared.ci[1])}] |\n\n`;
md += `**Measured latency** (ms, p50 / p95; seeded subsample n = ${r.latency.length}, caches bypassed): Global alone ${L("globalMs")}; fusion end-to-end ${L("totalMs")}; branches (wall) ${L("branchesWallMs")}; fusion step ${q("fusionMs", 0.5).toFixed(2)} ms.\n\n`;
md += `**Resources and deviations.**\n\n- Quality pass ${r.resources.qualitySec} s; total ${r.resources.totalSec} s; peak RSS ${r.resources.peakRssSampled500msMB} MB.\n- Token-budget violations: ${summary.budgetViolations}.\n- Stand-alone Global vs fusion Global-branch mismatches on the latency subsample: ${r.parityMismatchesOnLatencySubsample}.\n`;
fs.writeFileSync("research/v1.1/v11c/WIXQA_SYNTHETIC_RESULTS.md", md);
console.log(md);
