/** POST-HOC (not pre-specified) robustness check for WIXQA_HETEROGENEITY item 10. Optimization questions only. */
// POST-HOC diagnostic (optimization only): single-config Recall@5 ranking vs coverage-selected G.
import { readJson } from "./datasets/enterpriserag";
import { loadPrimaryQuestions, toHarnessQuestions } from "./datasets/wixqa";
import { rankMetrics } from "./scorers";
const s = readJson<any>("validation/work/wixqa/v1-full/search.json");
const split = readJson<any>("validation/splits/wixqa.json").questions;
const qs = toHarnessQuestions(await loadPrimaryQuestions(), split).filter((q) => q.split === "optimization");
const rows = s.trials.map((t: any) => {
  const r5 = qs.reduce((a, q) => a + rankMetrics(s.outcomes[t.key][q.id].ranking, q.goldDocIds!).recall5, 0) / qs.length;
  return { key: t.key, r5: +(r5 * 100).toFixed(2), cov: +(t.optimization.evidenceCoverage * 100).toFixed(2), tokens: Math.round(t.optimization.contextTokens) };
});
rows.sort((a: any, b: any) => b.r5 - a.r5);
console.log("top by R@5:", rows.slice(0, 8));
console.log("top by coverage:", [...rows].sort((a: any, b: any) => b.cov - a.cov).slice(0, 5));
console.log("G rank by R@5:", rows.findIndex((r: any) => r.key === "fixed-512|hybrid|minilm-l6|-|-|cross-encoder|k8") + 1);
// POST-HOC CV: same 5 grouped folds as wixqa-heterogeneity.ts; single best-by-R@5 config chosen on train folds.
import { rng, shuffle } from "./datasets/enterpriserag";
import { SEED } from "./env";
const meta = new Map(split.map((x: any) => [x.questionId, x]));
const groups = shuffle([...new Set(qs.map((q) => (meta.get(q.id) as any).group as string))].sort(), rng(SEED));
const fog = new Map<string, number>(); const fs5 = [0, 0, 0, 0, 0];
for (const g of groups) { const f = fs5.indexOf(Math.min(...fs5)); fog.set(g, f); fs5[f] += qs.filter((q) => (meta.get(q.id) as any).group === g).length; }
const r5 = (k: string, q: any) => rankMetrics(s.outcomes[k][q.id].ranking, q.goldDocIds).recall5;
const lens = qs.map((q) => q.question.length).sort((a, b) => a - b);
const t1 = lens[Math.floor(lens.length / 3)], t2 = lens[Math.floor((2 * lens.length) / 3)];
const cell = (q: any) => (q.question.length < t1 ? "s" : q.question.length < t2 ? "m" : "l");
let single = 0, perCell = 0;
for (let f = 0; f < 5; f++) {
  const tr = qs.filter((q) => fog.get((meta.get(q.id) as any).group) !== f), te = qs.filter((q) => fog.get((meta.get(q.id) as any).group) === f);
  const best = (set: any[]) => s.trials.map((t: any) => t.key).reduce((b: string, k: string) => (set.reduce((a, q) => a + r5(k, q), 0) > set.reduce((a, q) => a + r5(b, q), 0) + 1e-9 ? k : b));
  const bs = best(tr);
  const bc = Object.fromEntries(["s", "m", "l"].map((c) => [c, best(tr.filter((q) => cell(q) === c))]));
  for (const q of te) { single += r5(bs, q); perCell += r5(bc[cell(q)], q); }
}
console.log("POST-HOC CV R@5: single best-by-R@5 (train folds) =", (single / qs.length * 100).toFixed(2), "| length-tercile best-by-R@5 =", (perCell / qs.length * 100).toFixed(2));
