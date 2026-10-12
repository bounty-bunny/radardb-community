import type { Evidence, LatencyStats, Metrics } from "@/core/domain";
import { normalize } from "./text";

export interface ContextScore {
  /** Share of required evidence present in at least one context item. */
  recall: number;
  /** Share of context items containing at least one piece of required evidence. */
  precision: number;
  /** All required evidence present. */
  success: boolean;
  hits: boolean[];
}

/**
 * Offline judge for retrieval: evidence counts as retrieved only when a
 * single context item contains it (normalized substring), so phrases can't
 * be stitched together across chunk boundaries. It does not judge LLM answers.
 */
export function scoreContext(items: string[], evidence: Evidence[]): ContextScore {
  const norm = items.map(normalize);
  const alts = evidence.map((e) => (Array.isArray(e) ? e : [e]).map(normalize).filter(Boolean));
  const hits = alts.map((a) => norm.some((t) => a.some((x) => t.includes(x))));
  const relevant = norm.filter((t) => alts.some((a) => a.some((x) => t.includes(x)))).length;
  const found = hits.filter(Boolean).length;
  return {
    recall: evidence.length ? found / evidence.length : 0,
    precision: items.length ? relevant / items.length : 0,
    success: evidence.length > 0 && found === evidence.length,
    hits,
  };
}

export interface Outcome {
  recall: number;
  precision: number;
  success: boolean;
  tokens: number;
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
}

/** Wilson score interval (95%) for a proportion. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 0];
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function aggregate(outcomes: Outcome[]): Metrics {
  const n = outcomes.length;
  if (!n)
    return {
      n: 0,
      evidenceCoverage: 0,
      retrievalSuccess: 0,
      retrievalSuccessCI: [0, 0],
      contextPrecision: 0,
      contextTokens: 0,
      estimatedCostUsd: 0,
      estimatedLatencyMs: 0,
    };
  const mean = (f: (o: Outcome) => number) => outcomes.reduce((s, o) => s + f(o), 0) / n;
  const wins = outcomes.filter((o) => o.success).length;
  return {
    n,
    evidenceCoverage: mean((o) => o.recall),
    retrievalSuccess: wins / n,
    retrievalSuccessCI: wilson(wins, n),
    contextPrecision: mean((o) => o.precision),
    contextTokens: mean((o) => o.tokens),
    estimatedCostUsd: mean((o) => o.estimatedCostUsd),
    estimatedLatencyMs: mean((o) => o.estimatedLatencyMs),
  };
}

export function latencyStats(samples: number[], method: string): LatencyStats | null {
  if (!samples.length) return null;
  const s = [...samples].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
  return { n: s.length, p50: q(0.5), p95: q(0.95), mean: s.reduce((a, b) => a + b, 0) / s.length, method };
}
