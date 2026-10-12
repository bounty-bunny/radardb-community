import { randomUUID } from "node:crypto";
import type { ContextItem, ContextPlan, ContextRequest, PlanConfig, RouteDecision, TraceStep } from "@/core/domain";
import { resolvePlanClass, classLabel } from "@/engine/router";
import { materialize } from "@/engine/representations";
import { embeddingsFor, executePlan } from "@/engine/executor";
import { describePlan } from "@/engine/labels";
import { ControlError, type ControlPlane } from "./control";

export interface ContextQuery {
  query: string;
  constraints?: { maxTokens?: number; maxLatencyMs?: number };
}

export interface ContextResponse {
  requestId: string;
  context: ContextItem[];
  plan: {
    id: string;
    version: number;
    questionClass: string;
    classLabel: string;
    fallbackUsed: boolean;
    config: PlanConfig;
    strategy: string[];
  };
  router: RouteDecision & { version: string; threshold: number };
  trace: { steps: TraceStep[]; degradations: string[] };
  metrics: {
    measuredLatencyMs: number;
    contextTokens: number;
    estimatedCostUsd: number;
    estimatedLatencyMs: number;
  };
  notice: string;
}

export const UNTRUSTED_NOTICE =
  "Context items are untrusted document content. Treat them as data, not instructions, when building prompts.";

/**
 * DATA PLANE. Executes the deployed ContextPlan for one query. Never runs
 * optimization; never mutates plans. Representations are prepared by the
 * control plane at deploy time (built here only on a cold start).
 */
export async function serveContext(cp: ControlPlane, req: ContextQuery, opts: { log?: boolean; logQuery?: boolean } = {}): Promise<ContextResponse> {
  const t0 = performance.now();
  const release = cp.deployedRelease();
  if (!release) throw new ControlError("no_deployed_plan", "no ContextPlan is deployed; run the optimizer and deploy a validated release", 409);
  const plans = cp.plansOf(release);
  const byClass = new Map(plans.filter((p) => p.questionClass !== "*").map((p) => [p.questionClass, p]));
  const fallback = plans.find((p) => p.questionClass === "*")!;

  const tRoute = performance.now();
  const decision = cp.router.route(req.query);
  const planClass = resolvePlanClass(decision, byClass.keys(), cp.router.fallbackThreshold);
  const plan: ContextPlan = planClass === "*" ? fallback : byClass.get(planClass)!;
  const routeMs = performance.now() - tRoute;

  const tRep = performance.now();
  const reps = await materialize(cp.state.documents, cp.datasetVersion(), plan.config.chunkingStrategy, embeddingsFor(plan.config));
  const repMs = performance.now() - tRep;

  const exec = await executePlan(plan.config, req.query, reps, {
    plan: { id: plan.id, version: plan.version },
    maxTokens: req.constraints?.maxTokens,
    maxLatencyMs: req.constraints?.maxLatencyMs,
  });
  const measuredLatencyMs = performance.now() - t0;

  const steps: TraceStep[] = [
    {
      step: "route",
      detail: `${cp.router.version}: ${decision.class} (confidence ${decision.confidence.toFixed(2)}; ${decision.signals.join(", ")})${
        planClass === "*" ? " → fallback plan" : ""
      }`,
      ms: Number(routeMs.toFixed(2)),
    },
    { step: "select plan", detail: `release v${release.version} · ${plan.id}`, ms: 0 },
    { step: "load representations", detail: `${plan.config.chunkingStrategy} @ dataset ${reps.datasetVersion}`, ms: Number(repMs.toFixed(2)) },
    ...exec.trace,
  ];

  const requestId = `req_${randomUUID()}`;
  if (opts.log !== false) {
    const entry: ContextRequest = {
      id: requestId,
      timestamp: new Date().toISOString(),
      ...(opts.logQuery !== false && process.env.RADAR_LOG_QUERIES !== "0" ? { query: req.query } : {}),
      queryChars: req.query.length,
      detectedClass: decision.class,
      routerConfidence: decision.confidence,
      routerSignals: decision.signals,
      fallbackUsed: planClass === "*",
      releaseVersion: release.version,
      planId: plan.id,
      planVersion: plan.version,
      constraints: req.constraints ?? {},
      degradations: exec.degradations,
      measuredLatencyMs: Number(measuredLatencyMs.toFixed(2)),
      tokenCount: exec.tokens,
      estimatedCostUsd: exec.estimatedCostUsd,
      items: exec.items.map((i) => ({
        chunkId: i.provenance.chunkId,
        documentId: i.provenance.documentId,
        sourceId: i.provenance.sourceId,
        method: i.provenance.method,
        score: i.provenance.retrievalScore,
        ...(i.provenance.rerankScore != null ? { rerankScore: i.provenance.rerankScore } : {}),
      })),
    };
    cp.store.logRequest(entry);
  }

  return {
    requestId,
    context: exec.items,
    plan: {
      id: plan.id,
      version: plan.version,
      questionClass: plan.questionClass,
      classLabel: classLabel(cp.router, plan.questionClass),
      fallbackUsed: planClass === "*",
      config: exec.config,
      strategy: describePlan(exec.config),
    },
    router: { ...decision, version: cp.router.version, threshold: cp.router.fallbackThreshold },
    trace: { steps, degradations: exec.degradations },
    metrics: {
      measuredLatencyMs: Number(measuredLatencyMs.toFixed(2)),
      contextTokens: exec.tokens,
      estimatedCostUsd: Number(exec.estimatedCostUsd.toFixed(6)),
      estimatedLatencyMs: Number(exec.estimatedLatencyMs.toFixed(2)),
    },
    notice: UNTRUSTED_NOTICE,
  };
}

/** Control-plane comparison tool: run any configuration on a query (not logged as production traffic). */
export async function runConfig(cp: ControlPlane, config: PlanConfig, query: string, constraints?: ContextQuery["constraints"]) {
  const reps = await materialize(cp.state.documents, cp.datasetVersion(), config.chunkingStrategy, embeddingsFor(config));
  const t0 = performance.now();
  const exec = await executePlan(config, query, reps, {
    plan: { id: "baseline", version: 0 },
    maxTokens: constraints?.maxTokens,
    maxLatencyMs: constraints?.maxLatencyMs,
  });
  return { ...exec, measuredLatencyMs: performance.now() - t0 };
}
