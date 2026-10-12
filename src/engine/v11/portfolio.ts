/**
 * V1.1 candidate ContextPlan discovery: a small complementary portfolio.
 * Computed from TRAINING questions only (callers pass training indices).
 * Starts from the global plan and greedily adds the configuration that most
 * increases the per-question best utility of the portfolio, while the gain is
 * at least `minGain` and the portfolio is below `maxSize`.
 */
import { mean, type UtilityRow } from "./objective";

export interface Portfolio {
  keys: string[];
  /** Training-set oracle utility after each addition (diagnostic). */
  oracleTrail: number[];
}

export function greedyPortfolio(rows: UtilityRow[], idx: number[], globalKey: string, opts: { maxSize?: number; minGain?: number } = {}): Portfolio {
  const maxSize = opts.maxSize ?? 4;
  const minGain = opts.minGain ?? 0.02;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const g = byKey.get(globalKey);
  if (!g) throw new Error(`global plan ${globalKey} not among candidates`);
  const best = idx.map((i) => g.u[i]);
  const keys = [globalKey];
  const trail = [mean(best)];
  while (keys.length < maxSize) {
    let pick: UtilityRow | null = null;
    let pickGain = 0;
    for (const r of rows) {
      if (keys.includes(r.key)) continue;
      let gain = 0;
      idx.forEach((i, j) => (gain += Math.max(0, r.u[i] - best[j])));
      gain /= idx.length;
      if (gain > pickGain + 1e-12 || (pick && Math.abs(gain - pickGain) <= 1e-12 && r.key < pick.key)) {
        pick = r;
        pickGain = gain;
      }
    }
    if (!pick || pickGain < minGain) break;
    keys.push(pick.key);
    idx.forEach((i, j) => (best[j] = Math.max(best[j], pick!.u[i])));
    trail.push(mean(best));
  }
  return { keys, oracleTrail: trail };
}
