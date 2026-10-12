/**
 * Held-out evaluation. Mirrors the frozen validatePlans()
 * (src/engine/optimizer/validate.ts @ a2464f5): same execution path, same
 * routing (resolvePlanClass), same aggregation. Runs strictly after plans are
 * frozen; its output is reported and never fed back into selection.
 */
import type { ContextItem, Document, LatencyStats, Metrics, PlanConfig } from "@/core/domain";
import { materialize } from "@/engine/representations";
import { embeddingsFor, executePlan } from "@/engine/executor";
import { aggregate, latencyStats, type Outcome } from "@/engine/evaluate";
import { warmModels } from "@/engine/models";
import type { Calibration } from "@/engine/cost";
import type { HarnessQuestion, Scorer } from "./scorers";

export interface SystemDef {
  name: string;
  /** Which plan class and configuration serve this question. */
  resolve(q: HarnessQuestion): { planClass: string; config: PlanConfig };
}

export interface QuestionResult {
  questionId: string;
  planClass: string;
  outcome: Outcome;
  items: ContextItem[];
}

export interface SystemResult {
  name: string;
  metrics: Metrics;
  perClass: Record<string, Metrics>;
  perQuestion: QuestionResult[];
  measuredLatency: LatencyStats | null;
  rerankMs: LatencyStats | null;
  assembleMs: LatencyStats | null;
}

export const LATENCY_METHOD = "wall-clock per request: cold model inference (result caches bypassed), warm indexes, in-process, this machine";

export async function evaluateHeldOut(args: {
  dataset: { version: string; documents: Document[] };
  questions: HarnessQuestion[];
  systems: SystemDef[];
  scorer: Scorer;
  calibration: Calibration;
  measureLatency?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<SystemResult[]> {
  const bad = args.questions.filter((q) => q.split !== "validation");
  if (bad.length) throw new Error("HOLDOUT ISOLATION: evaluateHeldOut() must only receive held-out questions");
  const qs = args.questions.filter((q) => args.scorer.isScorable(q));
  const reps = new Map<string, Awaited<ReturnType<typeof materialize>>>();
  const repFor = async (cfg: PlanConfig) => {
    if (!reps.has(cfg.chunkingStrategy))
      reps.set(cfg.chunkingStrategy, await materialize(args.dataset.documents, args.dataset.version, cfg.chunkingStrategy, []));
    await materialize(args.dataset.documents, args.dataset.version, cfg.chunkingStrategy, embeddingsFor(cfg));
    return reps.get(cfg.chunkingStrategy)!;
  };

  const results: SystemResult[] = [];
  for (const sys of args.systems) {
    const perQuestion: QuestionResult[] = [];
    for (const q of qs) {
      const { planClass, config } = sys.resolve(q);
      const r = await executePlan(config, q.question, await repFor(config), { plan: { id: "validation", version: 0 }, cache: true, calibration: args.calibration });
      const s = args.scorer.score(r.items, q);
      perQuestion.push({
        questionId: q.id,
        planClass,
        items: r.items,
        outcome: {
          recall: s.recall,
          precision: s.precision,
          success: s.success,
          tokens: r.tokens,
          estimatedCostUsd: r.estimatedCostUsd,
          estimatedLatencyMs: r.estimatedLatencyMs,
        },
      });
    }
    const classes = [...new Set(perQuestion.map((p) => p.planClass))];
    results.push({
      name: sys.name,
      metrics: aggregate(perQuestion.map((p) => p.outcome)),
      perClass: Object.fromEntries(classes.map((c) => [c, aggregate(perQuestion.filter((p) => p.planClass === c).map((p) => p.outcome))])),
      perQuestion,
      measuredLatency: null,
      rerankMs: null,
      assembleMs: null,
    });
    args.onProgress?.(`evaluated ${sys.name}`);
  }

  if (args.measureLatency !== false && qs.length) {
    const all = args.systems.flatMap((s) => qs.map((q) => s.resolve(q).config));
    await warmModels({ embed: all.some((c) => embeddingsFor(c).includes("minilm-l6")), rerank: all.some((c) => c.reranker !== "none") });
    for (const res of results) {
      const sys = args.systems.find((s) => s.name === res.name)!;
      const total: number[] = [];
      const rerank: number[] = [];
      const assemble: number[] = [];
      for (const q of qs) {
        const { config } = sys.resolve(q);
        const r = await executePlan(config, q.question, await repFor(config), { plan: { id: "latency", version: 0 }, cache: false, calibration: args.calibration });
        total.push(r.measuredLatencyMs);
        const rr = r.trace.find((t) => t.step === "rerank");
        if (rr) rerank.push(rr.ms);
        const as = r.trace.find((t) => t.step === "assemble");
        if (as) assemble.push(as.ms);
      }
      res.measuredLatency = latencyStats(total, LATENCY_METHOD);
      res.rerankMs = latencyStats(rerank, "reranker step, cold inference");
      res.assembleMs = latencyStats(assemble, "context assembly step");
      args.onProgress?.(`latency ${res.name}`);
    }
  }
  return results;
}
