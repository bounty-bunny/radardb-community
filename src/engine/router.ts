import type { RouteDecision, WorkloadClass } from "@/core/domain";
import { extractEntities, isLinkingEntity } from "./entities";

/**
 * Routes a question to a workload class. Classes are data: a router declares
 * the classes it can emit, and plans are looked up by class id. A low
 * confidence decision makes the data plane use the release's fallback plan.
 */
export interface QuestionRouter {
  readonly version: string;
  readonly classes: WorkloadClass[];
  /** Below this confidence the data plane uses the fallback plan. */
  readonly fallbackThreshold: number;
  route(question: string): RouteDecision;
}

interface Rule {
  class: string;
  signal: string;
  weight: number;
  test: (q: string, lower: string) => boolean;
}

/** Transparent rule-based router: each matched signal raises confidence (noisy-OR). */
export class RuleBasedRouter implements QuestionRouter {
  constructor(
    readonly version: string,
    readonly classes: WorkloadClass[],
    private rules: Rule[],
    private defaultClass: string,
    private defaultConfidence: number,
    readonly fallbackThreshold = 0.5,
  ) {}

  route(question: string): RouteDecision {
    const lower = question.toLowerCase();
    const scores = new Map<string, { miss: number; signals: string[] }>();
    for (const r of this.rules) {
      if (!r.test(question, lower)) continue;
      const s = scores.get(r.class) ?? { miss: 1, signals: [] };
      s.miss *= 1 - r.weight;
      s.signals.push(r.signal);
      scores.set(r.class, s);
    }
    // Ties resolve by class declaration order (intent before identifiers).
    let best: RouteDecision | null = null;
    for (const c of this.classes) {
      const s = scores.get(c.id);
      if (!s) continue;
      const confidence = 1 - s.miss;
      if (!best || confidence > best.confidence + 1e-9) best = { class: c.id, confidence, signals: s.signals };
    }
    return best ?? { class: this.defaultClass, confidence: this.defaultConfidence, signals: ["no intent or identifier signals"] };
  }
}

export const DEMO_CLASSES: WorkloadClass[] = [
  { id: "procedure", label: "How-to", description: "Steps from runbooks and conventions" },
  { id: "root_cause", label: "Root cause", description: "Why something happened, across incidents, deploys and code" },
  { id: "lookup", label: "Lookup", description: "Specific records: who, which, when, ticket or deploy IDs" },
  { id: "general", label: "General", description: "Policies, targets and facts in everyday language" },
];

/**
 * rules-v1 — frozen. Written while the full demo question set was visible
 * (see ARCHITECTURE_AUDIT H5); never tuned against measured results.
 * Change the rules only by shipping a new version.
 */
export const demoRouter: QuestionRouter = new RuleBasedRouter(
  "rules-v1",
  DEMO_CLASSES,
  [
    { class: "procedure", signal: "how-to phrasing", weight: 0.85, test: (_, s) => /\bhow (do|can|should|would) (i|we)\b/.test(s) },
    { class: "procedure", signal: "steps / runbook wording", weight: 0.7, test: (_, s) => /\bsteps?\b|\bprocedure\b|\brunbook\b/.test(s) },
    { class: "root_cause", signal: "asks why", weight: 0.85, test: (_, s) => /\bwhy\b/.test(s) },
    {
      class: "root_cause",
      signal: "cause wording",
      weight: 0.8,
      test: (_, s) => /\bcaused?\b|\broot cause\b|\bwhat happened\b|\bwent wrong\b|\bled to\b/.test(s),
    },
    {
      class: "lookup",
      signal: "record identifier",
      weight: 0.8,
      test: (q) => extractEntities(q).some(isLinkingEntity),
    },
    {
      class: "lookup",
      signal: "named service or flag",
      weight: 0.55,
      test: (q) => extractEntities(q).some((e) => !isLinkingEntity(e)),
    },
    { class: "lookup", signal: "who/which/when wording", weight: 0.6, test: (_, s) => /\b(who|which|when|status|version)\b/.test(s) },
  ],
  "general",
  0.5,
);

/**
 * Which plan serves a routed question: the class plan when the router is
 * confident and a plan exists for that class, otherwise the fallback ("*").
 * Shared by validation and the data plane so both behave identically.
 */
export function resolvePlanClass(decision: RouteDecision, classesWithPlans: Iterable<string>, threshold: number): string {
  const has = new Set(classesWithPlans);
  return decision.confidence >= threshold && has.has(decision.class) ? decision.class : "*";
}

export function classLabel(router: { classes: WorkloadClass[] }, id: string): string {
  if (id === "*") return "Fallback";
  return router.classes.find((c) => c.id === id)?.label ?? id;
}
