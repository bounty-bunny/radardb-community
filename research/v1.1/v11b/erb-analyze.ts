/** V1.1B EnterpriseRAG held-out analysis (locked metrics; committed before the held-out run). */
import fs from "node:fs";
import { rng } from "@/engine/v11/objective";

type M = { recall5: number; recall10: number; ndcg10: number; success5: boolean; tokens: number };
type C = { both: number; "primary-only": number; "partner-only": number };
const r = JSON.parse(fs.readFileSync("research/v1.1/v11b/results/erb-heldout.json", "utf8")) as {
  n: number;
  heldOutLabelsRead: number;
  codeCommit: string;
  datasetVersion: string;
  systems: { global: string; fusion: string };
  records: { id: string; type: string; gold: number; global: M; fusion: M & { budget: number }; partnerR5: number; primaryBranchEqualsGlobal: boolean; contributionTop5: C; contributionContext: C }[];
  latency: Record<string, number>[];
  resources: { totalSec: number; peakRssSampled500msMB: number };
};
const rs = r.records;
const n = rs.length;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const d = rs.map((x) => x.fusion.recall5 - x.global.recall5);
const rand = rng(20261001);
const bs: number[] = [];
for (let b = 0; b < 10000; b++) {
  let s = 0;
  for (let j = 0; j < n; j++) s += d[Math.floor(rand() * n)];
  bs.push(s / n);
}
bs.sort((a, b) => a - b);
const delta = mean(d);
const ci = [bs[250], bs[9749]];
const scientific = delta > 0 && ci[0] > 0;
const product = scientific && delta >= 0.05;
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
const mcnemarP = fOnly + gOnly ? Math.min(1, 2 * cdf) : 1;
const improves = d.filter((x) => x > 1e-12).length;
const harms = d.filter((x) => x < -1e-12).length;
const ties = n - improves - harms;
const oracle2 = mean(rs.map((x) => Math.max(x.global.recall5, x.partnerR5)));
const G = { r5: mean(rs.map((x) => x.global.recall5)), r10: mean(rs.map((x) => x.global.recall10)), ndcg: mean(rs.map((x) => x.global.ndcg10)), s5: rs.filter((x) => x.global.success5).length, tok: mean(rs.map((x) => x.global.tokens)) };
const Fz = { r5: mean(rs.map((x) => x.fusion.recall5)), r10: mean(rs.map((x) => x.fusion.recall10)), ndcg: mean(rs.map((x) => x.fusion.ndcg10)), s5: rs.filter((x) => x.fusion.success5).length, tok: mean(rs.map((x) => x.fusion.tokens)) };
const capture = oracle2 - G.r5 > 1e-12 ? (Fz.r5 - G.r5) / (oracle2 - G.r5) : null;
const sumC = (k: "contributionTop5" | "contributionContext") => rs.reduce((a, x) => ({ both: a.both + x[k].both, "primary-only": a["primary-only"] + x[k]["primary-only"], "partner-only": a["partner-only"] + x[k]["partner-only"] }), { both: 0, "primary-only": 0, "partner-only": 0 });
const q = (k: string, p: number) => {
  const s = r.latency.map((l) => l[k]).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const lat = Object.fromEntries(["globalMs", "embedMs", "primaryBranchMs", "partnerBranchMs", "branchesWallMs", "fusionMs", "rerankMs", "assemblyMs", "totalMs"].map((k) => [k, { p50: q(k, 0.5), p95: q(k, 0.95) }]));
const types = [...new Set(rs.map((x) => x.type))].sort();
const byType = types.map((t) => {
  const s = rs.filter((x) => x.type === t);
  return { type: t, n: s.length, global: mean(s.map((x) => x.global.recall5)), fusion: mean(s.map((x) => x.fusion.recall5)), improves: s.filter((x) => x.fusion.recall5 > x.global.recall5 + 1e-12).length, harms: s.filter((x) => x.fusion.recall5 < x.global.recall5 - 1e-12).length };
});
const deviations = { budgetViolations: rs.filter((x) => x.fusion.tokens > x.fusion.budget).length, primaryBranchDiffersFromGlobal: rs.filter((x) => !x.primaryBranchEqualsGlobal).length };
const summary = { n, heldOutLabelsRead: r.heldOutLabelsRead, systems: r.systems, global: G, fusion: Fz, primary: { delta, ci, scientific, product }, mcnemar: { fusionOnly: fOnly, globalOnly: gOnly, p: mcnemarP }, improves, ties, harms, oracle2, headroom: oracle2 - G.r5, capture, contributionTop5: sumC("contributionTop5"), contributionContext: sumC("contributionContext"), latency: lat, byType, resources: r.resources, deviations };
fs.writeFileSync("research/v1.1/v11b/results/erb-heldout-summary.json", JSON.stringify(summary, null, 2));

const p = (x: number) => (x * 100).toFixed(1);
const pts = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;
const ms = (k: string) => `${lat[k].p50.toFixed(lat[k].p50 < 10 ? 2 : 0)} / ${lat[k].p95.toFixed(lat[k].p95 < 10 ? 2 : 0)}`;
let md = `# V1.1B EnterpriseRAG held-out result: FusionContextPlan vs Global Fixed\n\n`;
md += `**Locked test, run once.** EnterpriseRAG-Bench held-out (n = ${n}), 10K corpus (\`${r.datasetVersion}\`). Lock \`5dc1bf9\`; evaluator \`d91a302\` (smoke-tested on optimization questions only); run at \`${r.codeCommit.slice(0, 7)}\`. Held-out labels read: ${r.heldOutLabelsRead} (= n).\n\n`;
md += `- **Global Fixed:** \`${r.systems.global.split("|").join("\\|")}\`\n- **FusionContextPlan:** \`${r.systems.fusion.split("|").join("\\|")}\`\n\n`;
md += `## Primary: Recall@5\n\n| | Global Fixed | FusionContextPlan |\n|---|---|---|\n| Recall@5 | ${p(G.r5)}% | ${p(Fz.r5)}% |\n\n`;
md += `**Δ = ${pts(delta)} pts**, paired bootstrap 95% CI [${pts(ci[0])}, ${pts(ci[1])}] (10,000 resamples, seed 20261001).\n\n`;
md += `- **Scientific success** (Δ > 0, CI excludes 0): **${scientific ? "MET" : "NOT MET"}**\n- **Product-relevant success** (also Δ ≥ +5.0): **${product ? "MET" : "NOT MET"}**\n- Headroom captured: two-plan oracle ${p(oracle2)}%, headroom ${pts(oracle2 - G.r5)} pts, captured **${capture == null ? "n/a" : `${(capture * 100).toFixed(0)}%`}** (diagnostic)\n\n`;
md += `## Secondary (same frozen run)\n\n| Metric | Global Fixed | FusionContextPlan |\n|---|---|---|\n| Recall@10 | ${p(G.r10)}% | ${p(Fz.r10)}% |\n| nDCG@10 | ${p(G.ndcg)}% | ${p(Fz.ndcg)}% |\n| Success@5 | ${G.s5} / ${n} | ${Fz.s5} / ${n} |\n| Final context tokens (mean) | ${Math.round(G.tok)} | ${Math.round(Fz.tok)} |\n\n`;
md += `- Exact McNemar on Success@5: fusion-only ${fOnly} vs global-only ${gOnly}, p = ${mcnemarP.toFixed(3)}.\n- **Per question (Recall@5): fusion improves ${improves} / ties ${ties} / harms ${harms}.**\n\n`;
const ct = sumC("contributionTop5");
const cc = sumC("contributionContext");
md += `**Branch contribution** (gold documents, by which branches retrieved them):\n\n| | Both | Global-only | Partner-only |\n|---|---|---|---|\n| Top 5 | ${ct.both} | ${ct["primary-only"]} | ${ct["partner-only"]} |\n| Whole context | ${cc.both} | ${cc["primary-only"]} | ${cc["partner-only"]} |\n\n`;
md += `## Measured latency (ms, p50 / p95; caches bypassed, models warm)\n\n| Global Fixed alone | Fusion end-to-end | Query embedding | Global branch | Partner branch | Branches (wall) | Fusion step | Shared rerank | Assembly |\n|---|---|---|---|---|---|---|---|---|\n`;
md += `| ${ms("globalMs")} | ${ms("totalMs")} | ${ms("embedMs")} | ${ms("primaryBranchMs")} | ${ms("partnerBranchMs")} | ${ms("branchesWallMs")} | ${ms("fusionMs")} | ${ms("rerankMs")} | ${ms("assemblyMs")} |\n\n`;
md += `## Per question type (diagnostic, Recall@5)\n\n| Type | n | Global | Fusion | Improves / harms |\n|---|---|---|---|---|\n`;
for (const t of byType) md += `| ${t.type} | ${t.n} | ${p(t.global)}% | ${p(t.fusion)}% | ${t.improves} / ${t.harms} |\n`;
md += `\n## Resources and execution deviations\n\n- Run time ${r.resources.totalSec} s (both systems, quality pass and cold-latency pass); peak RSS ${r.resources.peakRssSampled500msMB} MB (sampled every 500 ms).\n- Token-budget violations: ${deviations.budgetViolations}. Questions where the fusion's Global branch differs from the stand-alone Global run: ${deviations.primaryBranchDiffersFromGlobal}.\n`;
fs.writeFileSync("research/v1.1/v11b/ERB_V1.1B_RESULTS.md", md);
console.log(md);
