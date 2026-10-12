/**
 * Final fit of the candidate FusionContextPlan on ALL optimization questions of one dataset
 * (no folds; the identical procedure each development fold applied to its training portion):
 *   G* (V1.1 objective) → partner shortlist (3, stored-ranking proxy) → real fusion × shared rerank {none, CE}
 *   → best by actual Recall@5 → gate (paired bootstrap 95% CI of the actual gain over G* excludes 0).
 * Optimization questions only. Writes the candidate plan; nothing is evaluated on held-out data.
 */
import fs from "node:fs";
import path from "node:path";
import type { PlanConfig } from "@/core/domain";
import { materialize, datasetVersionOf, type RepresentationSet } from "@/engine/representations";
import { embeddingsFor } from "@/engine/executor";
import { dedupeBehaviors, mean, rng, selectGlobal, type UtilityRow } from "@/engine/v11/objective";
import { executeFusionPlan, fusionKey, fusionPlan, type FusionPlanConfig } from "@/engine/v11/fusion";
import { rankMetrics, rankedDocIds } from "../../../validation/harness/scorers";
import { loadDataset, loadSearch, type DatasetId } from "../v11a/data";

const ROOT = process.env.RADAR_ROOT!;
const dsId = process.argv[2] as DatasetId;
const SEED = 20261001;
const ds = await loadDataset(dsId);
const search = loadSearch(ds);
const qs = ds.questions;
const all = [...Array(qs.length).keys()];
const docs = await ds.loadDocuments();
const version = datasetVersionOf(docs);
const toOriginal = (id: string) => id.replace(/^[a-z]+:/, "").replace(/#\d+$/, "");
const repsFor = (c: PlanConfig): Promise<RepresentationSet> => materialize(docs, version, c.chunkingStrategy, embeddingsFor(c));
const rows: UtilityRow[] = search.trials.map((t) => {
  const ms = qs.map((q) => rankMetrics(search.outcomes[t.key][q.id].ranking ?? [], q.gold));
  return { key: t.key, config: t.config, u: ms.map((m) => m.recall5), ndcg: ms.map((m) => m.ndcg10), tokens: qs.map((q) => search.outcomes[t.key][q.id].tokens) };
});
const rowOf = new Map(rows.map((r) => [r.key, r]));
const stored = (k: string, i: number) => search.outcomes[k][qs[i].id].ranking ?? [];
const proxyRrf = (a: string[], b: string[]) => {
  const s = new Map<string, number>();
  const first = new Map<string, number>();
  [a, b].forEach((l, li) => l.forEach((d, r) => (s.set(d, (s.get(d) ?? 0) + 1 / (61 + r)), first.has(d) || first.set(d, li * 1000 + r))));
  return [...s.keys()].sort((x, y) => s.get(y)! - s.get(x)! || first.get(x)! - first.get(y)!).slice(0, 8);
};
const r5 = (ranking: string[], i: number) => rankMetrics(ranking, qs[i].gold).recall5;

const cand = dedupeBehaviors(rows, all);
const gsel = selectGlobal(cand, all, { resamples: 1000, seed: SEED });
const G = gsel.key;
const gCfg = rowOf.get(G)!.config;
const shortlist = cand
  .filter((c) => c.key !== G)
  .map((c) => ({ c, v: mean(all.map((i) => r5(proxyRrf(stored(G, i), stored(c.key, i)), i))) }))
  .sort((a, b) => b.v - a.v || (a.c.key < b.c.key ? -1 : 1))
  .slice(0, 3);
const options: { plan: FusionPlanConfig; partnerKey: string; r5: number; perQ: number[]; proxyRank: number }[] = [];
for (const [proxyRank, s] of shortlist.entries())
  for (const rr of ["none", "cross-encoder"] as const) {
    const plan = fusionPlan(gCfg, s.c.config, rr);
    const reps = { primary: await repsFor(plan.primary), partner: await repsFor(plan.partner) };
    const perQ: number[] = [];
    for (const i of all) perQ.push(r5(rankedDocIds((await executeFusionPlan(plan, qs[i].question, reps, { plan: { id: "fusion", version: 1 }, cache: true })).items, toOriginal), i));
    options.push({ plan, partnerKey: s.c.key, r5: mean(perQ), perQ, proxyRank });
  }
options.sort((a, b) => b.r5 - a.r5 || (a.plan.sharedRerank === "none" ? -1 : 1) - (b.plan.sharedRerank === "none" ? -1 : 1) || a.proxyRank - b.proxyRank);
const best = options[0];
const d = all.map((i) => best.perQ[i] - rowOf.get(G)!.u[i]);
const rand = rng(SEED + 300);
const bs: number[] = [];
for (let r = 0; r < 2000; r++) {
  let s = 0;
  for (let j = 0; j < d.length; j++) s += d[Math.floor(rand() * d.length)];
  bs.push(s / d.length);
}
bs.sort((a, b) => a - b);
const gain = { delta: mean(d), ci: [bs[50], bs[1949]] };
const gated = gain.ci[0] > 0;
const out = {
  label: `Candidate FusionContextPlan — final fit on ${dsId} optimization questions (n=${qs.length}); held-out labels read: 0`,
  createdAt: new Date().toISOString(),
  dataset: dsId,
  datasetVersion: version,
  n: qs.length,
  globalPlan: { key: G, config: gCfg, nearBest: gsel.nearBest.length },
  fusionPlan: { key: fusionKey(best.plan), partnerKey: best.partnerKey, config: best.plan },
  optimizationGainOverGlobal: gain,
  fuseIfProvenDecision: gated,
  deployedSystem: gated ? "FusionContextPlan" : "Global Fixed (fusion not supported by training evidence)",
  options: options.map((o) => ({ key: fusionKey(o.plan), r5: o.r5 })),
  requiredRepresentations: [...new Set([best.plan.primary, best.plan.partner].map((c) => `${c.chunkingStrategy}:${embeddingsFor(c).join("+") || "lexical-only"}`))],
};
const file = path.join(ROOT, `research/v1.1/v11b/results/candidate-fusionplan-${dsId}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ G, fusion: out.fusionPlan.key, gain, gated, required: out.requiredRepresentations }, null, 1));
