import type { Metrics, Objective, PlanConfig, RunConstraints } from "@/core/domain";

export interface Candidate {
  key: string;
  config: PlanConfig;
  m: Metrics;
}

type Dir = "max" | "min";
export const PARETO_OBJECTIVES: { name: string; dir: Dir; get: (m: Metrics) => number }[] = [
  { name: "evidence coverage", dir: "max", get: (m) => m.evidenceCoverage },
  { name: "context precision", dir: "max", get: (m) => m.contextPrecision },
  { name: "context tokens", dir: "min", get: (m) => m.contextTokens },
  { name: "estimated latency", dir: "min", get: (m) => m.estimatedLatencyMs },
  { name: "estimated cost", dir: "min", get: (m) => m.estimatedCostUsd },
];

function dominates(a: Metrics, b: Metrics): boolean {
  let strictly = false;
  for (const o of PARETO_OBJECTIVES) {
    const x = o.get(a);
    const y = o.get(b);
    const better = o.dir === "max" ? x - y : y - x;
    if (better < -1e-9) return false;
    if (better > 1e-9) strictly = true;
  }
  return strictly;
}

/** Keys of candidates no other candidate beats on every objective. O(n²), fine for thousands. */
export function paretoFront(cands: Candidate[]): Set<string> {
  const front = new Set<string>();
  for (const a of cands) if (!cands.some((b) => b !== a && dominates(b.m, a.m))) front.add(a.key);
  return front;
}

export function withinConstraints(m: Metrics, c: RunConstraints): boolean {
  return (
    (c.maxTokens == null || m.contextTokens <= c.maxTokens) &&
    (c.maxCostUsd == null || m.estimatedCostUsd <= c.maxCostUsd) &&
    (c.maxLatencyMs == null || m.estimatedLatencyMs <= c.maxLatencyMs)
  );
}

export interface Selection {
  winner: Candidate;
  within: number;
  constraintsSatisfiable: boolean;
}

const TOLERANCE = 0.03;

/**
 * Choose one configuration. Inputs must be optimization-set metrics only:
 * callers never pass validation data here (enforced by the runner).
 *  - quality: highest retrieval success, then coverage, precision, fewer tokens
 *  - balanced: within 3 pts of the best success and coverage, lowest estimated cost
 *  - cost: at least as good as the baseline on this subset, lowest estimated cost
 *  - latency: within 3 pts of the best success, lowest estimated latency
 */
export function selectConfig(cands: Candidate[], objective: Objective, constraints: RunConstraints, floor: Metrics): Selection {
  const within = cands.filter((c) => withinConstraints(c.m, constraints));
  const pool = within.length ? within : cands;
  const tie = (a: Candidate, b: Candidate) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const byQuality = (a: Candidate, b: Candidate) =>
    b.m.retrievalSuccess - a.m.retrievalSuccess ||
    b.m.evidenceCoverage - a.m.evidenceCoverage ||
    b.m.contextPrecision - a.m.contextPrecision ||
    a.m.contextTokens - b.m.contextTokens ||
    tie(a, b);
  const bestS = Math.max(...pool.map((c) => c.m.retrievalSuccess));
  const bestC = Math.max(...pool.map((c) => c.m.evidenceCoverage));
  const nearBest = pool.filter((c) => c.m.retrievalSuccess >= bestS - TOLERANCE - 1e-9 && c.m.evidenceCoverage >= bestC - TOLERANCE - 1e-9);
  let winner: Candidate;
  switch (objective) {
    case "quality":
      winner = [...pool].sort(byQuality)[0];
      break;
    case "balanced":
      winner = [...nearBest].sort((a, b) => a.m.estimatedCostUsd - b.m.estimatedCostUsd || byQuality(a, b))[0];
      break;
    case "latency":
      winner = [...nearBest].sort((a, b) => a.m.estimatedLatencyMs - b.m.estimatedLatencyMs || byQuality(a, b))[0];
      break;
    case "cost": {
      const good = pool.filter(
        (c) => c.m.retrievalSuccess >= floor.retrievalSuccess - 1e-9 && c.m.evidenceCoverage >= floor.evidenceCoverage - 1e-9,
      );
      winner = [...(good.length ? good : pool)].sort((a, b) => a.m.estimatedCostUsd - b.m.estimatedCostUsd || byQuality(a, b))[0];
      break;
    }
  }
  return { winner, within: within.length, constraintsSatisfiable: within.length > 0 };
}
