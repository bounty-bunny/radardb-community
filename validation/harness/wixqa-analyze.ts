/**
 * WixQA held-out analysis (PREREGISTRATION §7, §11; WIXQA_SELECTION_LOCK.md).
 * Primary: pooled question-level Recall@5, RadarDB_quality vs E_globalFixed_quality, n = 120.
 * Paired bootstrap 10,000 resamples, seed 20261001; exact McNemar on Success@5.
 * The post-hoc tables (per routed class, transitions, specialization) are diagnostics, not tests.
 */
import fs from "node:fs";
import { SEED } from "./env";
import { rng } from "./datasets/enterpriserag";
import { loadPrimaryQuestions } from "./datasets/wixqa";

type QM = { recall1: number; recall3: number; recall5: number; recall10: number; ndcg5: number; ndcg10: number; mrr: number; success5: boolean; coverage: number; precision: number; success: boolean; tokens: number; items: number };
const o = JSON.parse(fs.readFileSync("validation/results/wixqa-heldout.json", "utf8")) as {
  n: number;
  heldOutLabelsRead: number;
  lockCommit: string;
  subset: Record<string, string>;
  routing: Record<string, { class: string; confidence: number }>;
  assignment: Record<string, Record<string, { planClass: string; configKey: string }>>;
  v1: Record<string, Record<string, QM>>;
  v1LatencyMs: Record<string, Record<string, number>>;
  baselineF: { key: string; perQuestion: Record<string, QM>; latencyMs: Record<string, number>; indexSec: number; chunks: number };
  timings: { v1Sec: number; fIndexSec: number };
  maxRssMB: number;
};
const SYSTEMS = ["RadarDB_quality", "E_globalFixed_quality", "RadarDB_balanced", "E_globalFixed_balanced", "A", "B", "C", "D", "F"] as const;
type Sys = (typeof SYSTEMS)[number];
const LABEL: Record<Sys, string> = {
  RadarDB_quality: "RadarDB ContextPlans (quality)",
  E_globalFixed_quality: "E — Best Global Fixed (quality)",
  RadarDB_balanced: "RadarDB ContextPlans (balanced)",
  E_globalFixed_balanced: "E — Best Global Fixed (balanced)",
  A: "A — Lexical BM25",
  B: "B — Vector MiniLM",
  C: "C — Hybrid",
  D: "D — Hybrid + cross-encoder",
  F: "F — bge-small (OUTSIDE RADARDB)",
};
const gold = new Map((await loadPrimaryQuestions()).map((q) => [q.id, q.gold.length]));
interface Row {
  q: string;
  subset: string;
  m: Record<Sys, QM>;
  lat: Record<Sys, number>;
  planQ: string;
  keyQ: string;
  keyE: string;
}
const rows: Row[] = Object.keys(o.assignment).map((q) => {
  const m = {} as Record<Sys, QM>;
  const lat = {} as Record<Sys, number>;
  for (const s of SYSTEMS) {
    if (s === "F") {
      m[s] = o.baselineF.perQuestion[q];
      lat[s] = o.baselineF.latencyMs[q];
    } else {
      const k = o.assignment[q][s].configKey;
      m[s] = o.v1[k][q];
      lat[s] = o.v1LatencyMs[k][q];
    }
  }
  return { q, subset: o.subset[q], m, lat, planQ: o.assignment[q].RadarDB_quality.planClass, keyQ: o.assignment[q].RadarDB_quality.configKey, keyE: o.assignment[q].E_globalFixed_quality.configKey };
});
if (rows.length !== 120 || o.heldOutLabelsRead !== 120) throw new Error(`expected 120 held-out questions, got ${rows.length}`);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pts = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;
const quant = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1) + 0.5))];
function summary(rs: Row[], s: Sys) {
  const n = rs.length;
  const sum = (f: (m: QM) => number) => rs.reduce((a, r) => a + f(r.m[s]), 0);
  const toks = rs.map((r) => r.m[s].tokens).sort((a, b) => a - b);
  const lats = rs.map((r) => r.lat[s]).sort((a, b) => a - b);
  return {
    n,
    recall5: sum((m) => m.recall5) / n,
    recall5Sum: sum((m) => m.recall5),
    hits5: rs.reduce((a, r) => a + Math.round(r.m[s].recall5 * gold.get(r.q)!), 0),
    goldTotal: rs.reduce((a, r) => a + gold.get(r.q)!, 0),
    recall1: sum((m) => m.recall1) / n,
    recall3: sum((m) => m.recall3) / n,
    recall10: sum((m) => m.recall10) / n,
    ndcg10: sum((m) => m.ndcg10) / n,
    mrr: sum((m) => m.mrr) / n,
    success5: sum((m) => (m.success5 ? 1 : 0)),
    coverage: sum((m) => m.coverage) / n,
    precision: sum((m) => m.precision) / n,
    tokensMean: sum((m) => m.tokens) / n,
    tokensMedian: quant(toks, 0.5),
    tokensP95: quant(toks, 0.95),
    latencyP50: quant(lats, 0.5),
    latencyP95: quant(lats, 0.95),
  };
}
function binom(n: number, k: number) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
function paired(rs: Row[], a: Sys, b: Sys) {
  const d = rs.map((r) => r.m[a].recall5 - r.m[b].recall5);
  const n = d.length;
  const mean = d.reduce((x, y) => x + y, 0) / n;
  const rand = rng(SEED);
  const boots: number[] = [];
  for (let i = 0; i < 10000; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += d[Math.floor(rand() * n)];
    boots.push(s / n);
  }
  boots.sort((x, y) => x - y);
  let bb = 0;
  let cc = 0;
  for (const r of rs) {
    if (r.m[a].success5 && !r.m[b].success5) bb++;
    if (!r.m[a].success5 && r.m[b].success5) cc++;
  }
  let cdf = 0;
  for (let i = 0; i <= Math.min(bb, cc); i++) cdf += binom(bb + cc, i) * 0.5 ** (bb + cc);
  return { a, b, n, delta: mean, ci: [boots[250], boots[9749]] as [number, number], wins: d.filter((x) => x > 1e-12).length, ties: d.filter((x) => Math.abs(x) <= 1e-12).length, losses: d.filter((x) => x < -1e-12).length, mcnemar: { aOnly: bb, bOnly: cc, p: bb + cc === 0 ? 1 : Math.min(1, 2 * cdf) } };
}

// ---------- Primary ----------
const primary = paired(rows, "RadarDB_quality", "E_globalFixed_quality");
const h1 = primary.delta >= 0.05 && primary.ci[0] > 0;
const SUBSETS = ["expertwritten", "simulated"];
const pooled = Object.fromEntries(SYSTEMS.map((s) => [s, summary(rows, s)]));
const bySubset = Object.fromEntries(SUBSETS.map((x) => [x, Object.fromEntries(SYSTEMS.map((s) => [s, summary(rows.filter((r) => r.subset === x), s)]))]));
const inSpace: Sys[] = ["RadarDB_quality", "E_globalFixed_quality", "A", "B", "C", "D"];
const bestInSpace = inSpace.reduce((b, s) => (pooled[s].recall5 > pooled[b].recall5 ? s : b), inSpace[0]);
const secondary = {
  subsetsPrimary: Object.fromEntries(SUBSETS.map((x) => [x, paired(rows.filter((r) => r.subset === x), "RadarDB_quality", "E_globalFixed_quality")])),
  balanced: paired(rows, "RadarDB_balanced", "E_globalFixed_balanced"),
  fVsGlobal: paired(rows, "F", "E_globalFixed_quality"),
  fVsBestInSpace: { ...paired(rows, "F", bestInSpace), bestInSpace },
};
const stop = {
  S1_bestFixedBeatsRadarDB: -primary.delta >= 0.02 && primary.ci[1] < 0,
  S5_outsideBeatsSpace: secondary.fVsBestInSpace.delta >= 0.05 && secondary.fVsBestInSpace.ci[0] > 0,
};

// ---------- Routing ----------
const count = (f: (r: Row) => string) => rows.reduce<Record<string, number>>((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
const planDist = count((r) => r.planQ);
const maxShare = Math.max(...Object.values(planDist)) / rows.length;
const routing = { routerClass: count((r) => o.routing[r.q].class), planQuality: planDist, planBalanced: count((r) => o.assignment[r.q].RadarDB_balanced.planClass), ROUTER_COLLAPSE: maxShare >= 0.8, maxShare, distinctConfigsQuality: new Set(rows.map((r) => r.keyQ)).size };

// ---------- POST-HOC diagnostics (pre-declared in the lock; not tests) ----------
const CLASSES = ["general", "procedure", "lookup", "root_cause", "*"];
const perClass = CLASSES.map((c) => {
  const rs = rows.filter((r) => r.planQ === c);
  if (!rs.length) return { planClass: c, n: 0 };
  const g = rs.reduce((a, r) => a + r.m.E_globalFixed_quality.recall5, 0) / rs.length;
  const x = rs.reduce((a, r) => a + r.m.RadarDB_quality.recall5, 0) / rs.length;
  return { planClass: c, n: rs.length, config: rs[0].keyQ, sameAsGlobal: rs[0].keyQ === rs[0].keyE, globalR5: g, radarR5: x, delta: x - g, wins: rs.filter((r) => r.m.RadarDB_quality.recall5 > r.m.E_globalFixed_quality.recall5 + 1e-12).length, losses: rs.filter((r) => r.m.RadarDB_quality.recall5 < r.m.E_globalFixed_quality.recall5 - 1e-12).length };
});
const cmp = (r: Row) => (r.m.RadarDB_quality.recall5 > r.m.E_globalFixed_quality.recall5 + 1e-12 ? "beats" : r.m.RadarDB_quality.recall5 < r.m.E_globalFixed_quality.recall5 - 1e-12 ? "loses" : "tie");
const away = rows.filter((r) => r.keyQ !== r.keyE);
const transitions = {
  all: { beats: rows.filter((r) => cmp(r) === "beats").length, tie: rows.filter((r) => cmp(r) === "tie").length, loses: rows.filter((r) => cmp(r) === "loses").length },
  routedAwayFromGlobal: away.length,
  correctSpecialization: away.filter((r) => cmp(r) === "beats").length,
  neutralSpecialization: away.filter((r) => cmp(r) === "tie").length,
  harmfulSpecialization: away.filter((r) => cmp(r) === "loses").length,
  stayedOnGlobal: rows.length - away.length,
  r5GainedOnCorrect: away.filter((r) => cmp(r) === "beats").reduce((a, r) => a + r.m.RadarDB_quality.recall5 - r.m.E_globalFixed_quality.recall5, 0),
  r5LostOnHarmful: away.filter((r) => cmp(r) === "loses").reduce((a, r) => a + r.m.E_globalFixed_quality.recall5 - r.m.RadarDB_quality.recall5, 0),
};
// Locked-configuration oracle (DIAGNOSTIC ONLY): per question, max R@5 over the distinct locked V1 configs.
const lockedKeys = Object.keys(o.v1);
const lockedOracle = rows.reduce((a, r) => a + Math.max(...lockedKeys.map((k) => o.v1[k][r.q].recall5)), 0) / rows.length;
const otherLockedBeatsGlobal = rows.filter((r) => Math.max(...lockedKeys.map((k) => o.v1[k][r.q].recall5)) > r.m.E_globalFixed_quality.recall5 + 1e-12).length;
const lockedSingle = Object.fromEntries(lockedKeys.map((k) => [k, rows.reduce((a, r) => a + o.v1[k][r.q].recall5, 0) / rows.length]));

const result = {
  label: "WixQA held-out evaluation — External benchmark relevance scoring (document-ID adapter); not RadarDB V1 native scoring",
  lockCommit: o.lockCommit,
  heldOutLabelsRead: o.heldOutLabelsRead,
  n: rows.length,
  primary: { ...primary, h1Supported: h1, criterion: "delta >= +5.0 pts AND 95% CI lower bound > 0" },
  secondary,
  stopConditions: stop,
  pooled,
  bySubset,
  routing,
  posthoc_DIAGNOSTIC: { perClass, transitions, lockedConfigOracle: { r5: lockedOracle, questionsWhereALockedConfigBeatsGlobal: otherLockedBeatsGlobal, perLockedConfigR5: lockedSingle } },
  resources: { v1Sec: o.timings.v1Sec, fIndexSec: o.timings.fIndexSec, fChunks: o.baselineF.chunks, maxRssMB: o.maxRssMB },
};
fs.writeFileSync("validation/results/wixqa-heldout-summary.json", JSON.stringify(result, null, 2));

// ---------- Markdown ----------
const P = pooled;
let md = `# WixQA held-out results — frozen RadarDB V1\n\n`;
md += `**WixQA primary (ExpertWritten + Simulated), full KB (6,221 articles).** Scoring: *External benchmark relevance scoring* (document-ID adapter), not RadarDB V1 native scoring. Selection lock \`${o.lockCommit.slice(0, 7)}\`. All systems were selected on the 280 optimization questions only and evaluated once on the same ${rows.length} held-out questions.\n\n`;
md += `Expectation recorded in the lock before held-out access: *H1 unlikely* (out-of-fold rules-v1 −2.8 pts on optimization data).\n\n`;
md += `## Primary (H1)\n\nRadarDB ContextPlans (quality) vs E — Best Global Fixed (quality), pooled question-level Recall@5, n = ${rows.length}.\n\n`;
md += `| | Recall@5 | Σ per-question Recall@5 / n | Gold articles in top-5 / total gold | Success@5 |\n|---|---|---|---|---|\n`;
for (const s of ["RadarDB_quality", "E_globalFixed_quality"] as Sys[]) md += `| ${LABEL[s]} | ${pct(P[s].recall5)} | ${P[s].recall5Sum.toFixed(2)} / ${P[s].n} | ${P[s].hits5} / ${P[s].goldTotal} | ${P[s].success5} / ${P[s].n} |\n`;
md += `\nΔ = **${pts(primary.delta)} pts**, paired bootstrap 95% CI [${pts(primary.ci[0])}, ${pts(primary.ci[1])}] (10,000 resamples, seed ${SEED}). Per-question wins/ties/losses: ${primary.wins}/${primary.ties}/${primary.losses}. Exact McNemar on Success@5: ${primary.mcnemar.aOnly} vs ${primary.mcnemar.bOnly}, p = ${primary.mcnemar.p.toFixed(3)}.\n\n`;
md += `**H1: ${h1 ? "SUPPORTED" : "NOT SUPPORTED"}** (criterion: Δ ≥ +5.0 pts AND CI lower bound > 0).\n\n`;
md += `Stop conditions: S1 (best fixed beats RadarDB by ≥ 2.0 pts, CI excludes 0) **${stop.S1_bestFixedBeatsRadarDB}**; S5 (outside baseline beats the space by ≥ 5.0 pts) **${stop.S5_outsideBeatsSpace}**; S3 ROUTER_COLLAPSE **${routing.ROUTER_COLLAPSE}** (max plan share ${pct(maxShare)}).\n\n`;
md += `## Per subset (preregistered: reported per subset and combined)\n\n| Subset | n | RadarDB (quality) | Global Fixed | F | Δ RadarDB − Global [95% CI] | W/T/L |\n|---|---|---|---|---|---|---|\n`;
for (const x of SUBSETS) {
  const b = bySubset[x];
  const c = secondary.subsetsPrimary[x];
  md += `| ${x} | ${b.RadarDB_quality.n} | ${pct(b.RadarDB_quality.recall5)} | ${pct(b.E_globalFixed_quality.recall5)} | ${pct(b.F.recall5)} | ${pts(c.delta)} [${pts(c.ci[0])}, ${pts(c.ci[1])}] | ${c.wins}/${c.ties}/${c.losses} |\n`;
}
md += `\n## All systems, pooled (n = ${rows.length})\n\n| System | R@5 | R@1 | R@3 | R@10 | nDCG@10 | MRR | Success@5 | Coverage | Precision | Tokens mean / median / p95 | Latency p50 / p95 (measured) |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const s of SYSTEMS) {
  const x = P[s];
  md += `| ${LABEL[s]} | ${pct(x.recall5)} | ${pct(x.recall1)} | ${pct(x.recall3)} | ${pct(x.recall10)} | ${pct(x.ndcg10)} | ${x.mrr.toFixed(3)} | ${x.success5}/${x.n} | ${pct(x.coverage)} | ${pct(x.precision)} | ${Math.round(x.tokensMean)} / ${x.tokensMedian} / ${x.tokensP95} | ${x.latencyP50.toFixed(1)} / ${x.latencyP95.toFixed(1)} ms |\n`;
}
const line = (t: string, c: ReturnType<typeof paired>) => `| ${t} | ${pts(c.delta)} | [${pts(c.ci[0])}, ${pts(c.ci[1])}] | ${c.wins}/${c.ties}/${c.losses} | ${c.mcnemar.aOnly} vs ${c.mcnemar.bOnly}, p = ${c.mcnemar.p.toFixed(3)} |\n`;
md += `\n## Secondary comparisons (pooled Recall@5; exploratory)\n\n| Comparison | Δ | 95% CI | W/T/L | McNemar Success@5 |\n|---|---|---|---|---|\n`;
md += line("RadarDB (balanced) − Global Fixed (balanced)", secondary.balanced);
md += line("F (bge-small) − Global Fixed (quality)", secondary.fVsGlobal);
md += line(`F − best in-space (${LABEL[bestInSpace]})`, secondary.fVsBestInSpace);
md += `\n## Routing (held-out, rules-v1)\n\n- Router classes: ${JSON.stringify(routing.routerClass)}\n- Plans used, quality: ${JSON.stringify(routing.planQuality)}; balanced: ${JSON.stringify(routing.planBalanced)}\n- Distinct configurations used by RadarDB (quality): ${routing.distinctConfigsQuality}\n\n`;
md += `## POST-HOC diagnostics (pre-declared in the selection lock; not hypothesis tests)\n\n### Per routed plan (quality)\n\n| Routed class | n | Configuration | Global R@5 | RadarDB R@5 | Δ | W / L |\n|---|---|---|---|---|---|---|\n`;
for (const c of perClass) if (c.n) md += `| ${c.planClass === "*" ? "fallback" : c.planClass} | ${c.n} | \`${c.config!.split("|").join("\\|")}\`${c.sameAsGlobal ? " (= Global)" : ""} | ${pct(c.globalR5!)} | ${pct(c.radarR5!)} | ${pts(c.delta!)} | ${c.wins} / ${c.losses} |\n`;
for (const c of perClass) if (!c.n) md += `| ${c.planClass === "*" ? "fallback" : c.planClass} | 0 | — | — | — | — | — |\n`;
md += `\n### Per-question transitions (RadarDB quality vs Global, Recall@5)\n\n| | Questions |\n|---|---|\n| RadarDB beats Global | ${transitions.all.beats} |\n| Tie | ${transitions.all.tie} |\n| RadarDB loses to Global | ${transitions.all.loses} |\n\n`;
md += `| Specialization (questions routed away from the Global configuration) | Questions | Σ R@5 change |\n|---|---|---|\n| Routed away | ${transitions.routedAwayFromGlobal} | |\n| Correct: routed away, retrieval improves | ${transitions.correctSpecialization} | +${transitions.r5GainedOnCorrect.toFixed(2)} |\n| Harmful: routed away, retrieval worsens | ${transitions.harmfulSpecialization} | −${transitions.r5LostOnHarmful.toFixed(2)} |\n| Neutral: routed away, tie | ${transitions.neutralSpecialization} | 0 |\n| Stayed on the Global configuration | ${transitions.stayedOnGlobal} | 0 |\n\n`;
md += `### Locked-configuration oracle (DIAGNOSTIC ONLY; never RadarDB performance)\n\nPer question, the max R@5 over the ${lockedKeys.length} distinct locked V1 configurations: **${pct(lockedOracle)}** (Global ${pct(P.E_globalFixed_quality.recall5)}). A locked configuration beats Global on ${otherLockedBeatsGlobal}/${rows.length} held-out questions.\n\n| Locked configuration | Held-out R@5 |\n|---|---|\n`;
for (const [k, v] of Object.entries(lockedSingle).sort((a, b) => b[1] - a[1])) md += `| \`${k.split("|").join("\\|")}\` | ${pct(v)} |\n`;
md += `\n## Resources\n\nV1 evaluation ${Math.round(o.timings.v1Sec)} s (all locked configs plus the cold-latency pass); F index ${Math.round(o.timings.fIndexSec)} s / ${o.baselineF.chunks} chunks; RSS at end ${o.maxRssMB} MB. Latency is wall-clock per query, with model result caches bypassed and warm indexes, in-process, on this machine (OS build 26300). F latency includes query embedding.\n\nHeld-out labels read: ${o.heldOutLabelsRead} (= n).\n`;
fs.writeFileSync("validation/results/WIXQA_HELDOUT_RESULTS.md", md);
console.log(md);
