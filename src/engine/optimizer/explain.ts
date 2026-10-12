import type { Metrics, Objective, PlanConfig, PlanExplanation, RunConstraints } from "@/core/domain";
import { familyOf, planKey, describePlan } from "../labels";
import { selectConfig, type Candidate } from "./selection";

const pts = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))} pts`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

const ABLATIONS: { change: string; apply: (c: PlanConfig) => PlanConfig | null }[] = [
  { change: "without the cross-encoder reranker", apply: (c) => (c.reranker === "none" ? null : { ...c, reranker: "none" }) },
  { change: "with the cross-encoder reranker", apply: (c) => (c.reranker === "none" ? { ...c, reranker: "cross-encoder" } : null) },
  { change: "without exact-ID boost", apply: (c) => (c.exactMatchBoost ? { ...c, exactMatchBoost: false } : null) },
  { change: "with exact-ID boost", apply: (c) => (c.exactMatchBoost ? null : { ...c, exactMatchBoost: true }) },
  { change: "without entity-graph expansion", apply: (c) => (c.graphStrategy === "none" ? null : { ...c, graphStrategy: "none" }) },
  { change: "with entity-graph expansion", apply: (c) => (c.graphStrategy === "none" ? { ...c, graphStrategy: "entity-expansion" } : null) },
  { change: "with fixed 512-token chunks", apply: (c) => (c.chunkingStrategy === "fixed-512" ? null : { ...c, chunkingStrategy: "fixed-512" }) },
];

/**
 * Explains a selection the way a query optimizer's EXPLAIN does: the best
 * competitor from each retrieval family, single-component ablations, and
 * data-derived reasons. Uses optimization-set metrics only.
 */
export function explainSelection(args: {
  questionClass: string;
  questions: number;
  selected: Candidate;
  candidates: Candidate[];
  objective: Objective;
  constraints: RunConstraints;
  baseline: Metrics;
  within: number;
}): PlanExplanation {
  const { selected, candidates, objective, constraints, baseline } = args;
  const byKey = new Map(candidates.map((c) => [c.key, c]));

  const families = new Map<string, Candidate[]>();
  for (const c of candidates) families.set(familyOf(c.config), [...(families.get(familyOf(c.config)) ?? []), c]);
  const selFamily = familyOf(selected.config);
  const alternatives = [...families.entries()]
    .map(([label, group]) => {
      const best = label === selFamily ? selected : selectConfig(group, objective, constraints, baseline).winner;
      return { label, config: best.config, metrics: best.m, selected: best.key === selected.key };
    })
    .sort((a, b) => Number(b.selected) - Number(a.selected) || b.metrics.evidenceCoverage - a.metrics.evidenceCoverage);

  const ablations = ABLATIONS.flatMap((a) => {
    const cfg = a.apply(selected.config);
    const hit = cfg && byKey.get(planKey(cfg));
    return hit ? [{ change: a.change, metrics: hit.m }] : [];
  });

  const s = selected.m;
  const reasons: string[] = [];
  const objectiveText: Record<Objective, string> = {
    quality: "the highest retrieval success",
    balanced: "the lowest estimated cost among configurations within 3 pts of the best coverage and success",
    cost: "the lowest estimated cost among configurations at least as good as the baseline",
    latency: "the lowest estimated latency among configurations within 3 pts of the best coverage and success",
  };
  reasons.push(
    `Chosen for ${objectiveText[objective]}, out of ${args.within || candidates.length} configurations` +
      (args.within ? " within the run's constraints." : " (no configuration met the constraints, so all were considered)."),
  );
  reasons.push(
    `Against typical retrieval on these ${args.questions} optimization questions: evidence coverage ${pct(baseline.evidenceCoverage)} → ${pct(
      s.evidenceCoverage,
    )} (${pts(s.evidenceCoverage - baseline.evidenceCoverage)}), ${Math.round(baseline.contextTokens)} → ${Math.round(s.contextTokens)} tokens.`,
  );
  const rival = alternatives.filter((a) => !a.selected).sort((a, b) => b.metrics.evidenceCoverage - a.metrics.evidenceCoverage)[0];
  if (rival)
    reasons.push(
      `Best alternative family, ${rival.label}: ${pct(rival.metrics.evidenceCoverage)} coverage with ${Math.round(rival.metrics.contextTokens)} tokens ` +
        `(${pts(s.evidenceCoverage - rival.metrics.evidenceCoverage)} coverage, ${Math.round(s.contextTokens - rival.metrics.contextTokens)} tokens for the selected plan).`,
    );
  for (const a of ablations) {
    const d = a.metrics.evidenceCoverage - s.evidenceCoverage;
    if (Math.abs(d) >= 0.02)
      reasons.push(`${a.change[0].toUpperCase() + a.change.slice(1)}, coverage would be ${pct(a.metrics.evidenceCoverage)} (${pts(d)}).`);
  }

  return {
    questionClass: args.questionClass,
    optimizationQuestions: args.questions,
    configurationsEvaluated: candidates.length,
    configurationsWithinConstraints: args.within,
    alternatives,
    ablations,
    reasons,
  };
}

export function planSummary(c: PlanConfig) {
  return describePlan(c).join(" · ");
}
