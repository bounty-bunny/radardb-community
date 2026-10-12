import type { EvalQuestion, LatencyStats, Metrics, PlanConfig } from "@/core/domain";
import type { QuestionRouter } from "../router";
import { resolvePlanClass } from "../router";
import type { Dataset } from "./runner";
import { materialize } from "../representations";
import { embeddingsFor, executePlan } from "../executor";
import { aggregate, latencyStats, scoreContext, type Outcome } from "../evaluate";
import { warmModels } from "../models";
import type { Calibration } from "../cost";

export interface ValidateInput {
  dataset: Dataset;
  /** Held-out questions ONLY. */
  questions: EvalQuestion[];
  router: QuestionRouter;
  plans: Record<string, PlanConfig>;
  fallback: PlanConfig;
  baselineConfig: PlanConfig;
  calibration: Calibration;
  measureLatency?: boolean;
}

export interface QuestionValidation {
  questionId: string;
  planClass: string;
  plan: { recall: number; success: boolean; hits: boolean[]; tokens: number };
  baseline: { recall: number; success: boolean; hits: boolean[]; tokens: number };
}

export interface ValidateOutput {
  metrics: Metrics;
  baseline: Metrics;
  perClass: Record<string, { metrics: Metrics; baseline: Metrics }>;
  perQuestion: QuestionValidation[];
  measuredLatency: LatencyStats | null;
  baselineMeasuredLatency: LatencyStats | null;
}

const LATENCY_METHOD = "wall-clock per request: cold model inference (result caches bypassed), warm indexes, in-process, this machine";

/**
 * Held-out validation of an already selected plan set. Runs after
 * selection; its output is reported, never fed back into selection.
 */
export async function validatePlans(input: ValidateInput): Promise<ValidateOutput> {
  const bad = input.questions.filter((q) => q.split !== "validation");
  if (bad.length) throw new Error("validatePlans() must only receive held-out questions");
  const qs = input.questions.filter((q) => q.requiredEvidence.length > 0);
  const all = [...Object.values(input.plans), input.fallback, input.baselineConfig];
  const reps = new Map<string, Awaited<ReturnType<typeof materialize>>>();
  for (const cfg of all) {
    if (!reps.has(cfg.chunkingStrategy))
      reps.set(cfg.chunkingStrategy, await materialize(input.dataset.documents, input.dataset.version, cfg.chunkingStrategy, []));
    await materialize(input.dataset.documents, input.dataset.version, cfg.chunkingStrategy, embeddingsFor(cfg));
  }
  const run = async (cfg: PlanConfig, q: EvalQuestion, cache: boolean) =>
    executePlan(cfg, q.question, reps.get(cfg.chunkingStrategy)!, { plan: { id: "validation", version: 0 }, cache, calibration: input.calibration });

  const perQuestion: QuestionValidation[] = [];
  const planOut: (Outcome & { cls: string })[] = [];
  const baseOut: (Outcome & { cls: string })[] = [];
  for (const q of qs) {
    const cls = resolvePlanClass(input.router.route(q.question), Object.keys(input.plans), input.router.fallbackThreshold);
    const cfg = cls === "*" ? input.fallback : input.plans[cls];
    const [p, b] = [await run(cfg, q, true), await run(input.baselineConfig, q, true)];
    const ps = scoreContext(p.items.map((i) => i.text), q.requiredEvidence);
    const bs = scoreContext(b.items.map((i) => i.text), q.requiredEvidence);
    const o = (r: typeof p, s: typeof ps): Outcome => ({
      recall: s.recall,
      precision: s.precision,
      success: s.success,
      tokens: r.tokens,
      estimatedCostUsd: r.estimatedCostUsd,
      estimatedLatencyMs: r.estimatedLatencyMs,
    });
    planOut.push({ ...o(p, ps), cls });
    baseOut.push({ ...o(b, bs), cls });
    perQuestion.push({
      questionId: q.id,
      planClass: cls,
      plan: { recall: ps.recall, success: ps.success, hits: ps.hits, tokens: p.tokens },
      baseline: { recall: bs.recall, success: bs.success, hits: bs.hits, tokens: b.tokens },
    });
  }

  let measuredLatency: LatencyStats | null = null;
  let baselineMeasuredLatency: LatencyStats | null = null;
  if (input.measureLatency !== false && qs.length) {
    const needsRerank = all.some((c) => c.reranker !== "none");
    await warmModels({ embed: all.some((c) => embeddingsFor(c).includes("minilm-l6")), rerank: needsRerank });
    const planMs: number[] = [];
    const baseMs: number[] = [];
    for (const q of qs) {
      const cls = resolvePlanClass(input.router.route(q.question), Object.keys(input.plans), input.router.fallbackThreshold);
      const cfg = cls === "*" ? input.fallback : input.plans[cls];
      planMs.push((await run(cfg, q, false)).measuredLatencyMs);
      baseMs.push((await run(input.baselineConfig, q, false)).measuredLatencyMs);
    }
    measuredLatency = latencyStats(planMs, LATENCY_METHOD);
    baselineMeasuredLatency = latencyStats(baseMs, LATENCY_METHOD);
  }

  const classes = [...new Set(planOut.map((o) => o.cls))];
  return {
    metrics: aggregate(planOut),
    baseline: aggregate(baseOut),
    perClass: Object.fromEntries(
      classes.map((c) => [c, { metrics: aggregate(planOut.filter((o) => o.cls === c)), baseline: aggregate(baseOut.filter((o) => o.cls === c)) }]),
    ),
    perQuestion,
    measuredLatency,
    baselineMeasuredLatency,
  };
}
