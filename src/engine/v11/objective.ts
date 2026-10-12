/**
 * V1.1 optimization objective: rank-aware and uncertainty-aware.
 *
 * V1's `quality` objective sorted lexicographically by whole-context success,
 * which is rank-blind and lets a one-question difference decide (see
 * the V1.1 objective audit). V1.1 instead:
 *  1. scores each configuration by mean per-question utility (Recall@5);
 *  2. treats as tied every configuration whose paired bootstrap 95% CI for
 *     (best − it) includes 0 ("near-best");
 *  3. resolves the tie by mean nDCG@10, then fewer context tokens, then key.
 */
import type { PlanConfig } from "@/core/domain";

/** Per-question outcomes of one configuration, aligned to a fixed question order. */
export interface UtilityRow {
  key: string;
  config: PlanConfig;
  /** Primary utility per question (Recall@5). */
  u: number[];
  /** Secondary rank-aware quality per question (nDCG@10). */
  ndcg: number[];
  tokens: number[];
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simpler configurations first: no exact boost, no graph, then fewer tokens, then key. */
function simplicity(a: UtilityRow, b: UtilityRow) {
  const cost = (r: UtilityRow) => (r.config.exactMatchBoost ? 1 : 0) + (r.config.graphStrategy !== "none" ? 1 : 0);
  return cost(a) - cost(b) || mean(a.tokens) - mean(b.tokens) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

/**
 * Collapse configurations whose per-question utilities are identical on these
 * questions (e.g. exact boost / graph expansion that never changes the top-5),
 * keeping the simplest representative.
 */
export function dedupeBehaviors(rows: UtilityRow[], idx: number[]): UtilityRow[] {
  const groups = new Map<string, UtilityRow[]>();
  for (const r of rows) {
    const sig = idx.map((i) => r.u[i].toFixed(6)).join(",");
    groups.set(sig, [...(groups.get(sig) ?? []), r]);
  }
  return [...groups.values()].map((g) => [...g].sort(simplicity)[0]);
}

export interface GlobalSelection {
  key: string;
  meanU: number;
  bestMeanU: number;
  nearBest: string[];
}

/**
 * Best global fixed configuration on the questions `idx` (training questions only).
 * Uncertainty-aware: all configurations statistically tied with the best on
 * mean utility are candidates; the tie is broken by nDCG@10, then tokens.
 */
export function selectGlobal(rows: UtilityRow[], idx: number[], opts: { resamples?: number; seed?: number } = {}): GlobalSelection {
  const B = opts.resamples ?? 1000;
  const m = (r: UtilityRow) => mean(idx.map((i) => r.u[i]));
  const best = [...rows].sort((a, b) => m(b) - m(a) || simplicity(a, b))[0];
  // One shared set of bootstrap index draws so every comparison uses the same resamples.
  const rand = rng(opts.seed ?? 20261001);
  const samples: number[][] = Array.from({ length: B }, () => idx.map(() => idx[Math.floor(rand() * idx.length)]));
  const nearBest = rows.filter((r) => {
    if (r === best) return true;
    const diffs = samples.map((s) => s.reduce((a, i) => a + best.u[i] - r.u[i], 0) / s.length).sort((a, b) => a - b);
    return diffs[Math.floor(0.025 * B)] <= 0; // lower 95% bound of (best − r) does not exclude 0
  });
  const nd = (r: UtilityRow) => mean(idx.map((i) => r.ndcg[i]));
  const chosen = [...nearBest].sort((a, b) => nd(b) - nd(a) || simplicity(a, b))[0];
  return { key: chosen.key, meanU: m(chosen), bestMeanU: m(best), nearBest: nearBest.map((r) => r.key) };
}
