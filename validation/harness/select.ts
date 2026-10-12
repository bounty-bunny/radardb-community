/**
 * Harness re-implementation of the frozen optimize() ORCHESTRATION LOOP
 * (src/engine/optimizer/runner.ts @ a2464f5). Every decision is delegated to
 * frozen code: materialize, executePlan, aggregate, paretoFront,
 * selectConfig, explainSelection, resolvePlanClass. The only substitution is
 * the per-question scorer. Fidelity is enforced by Test 0b.
 */
import type { ChunkingStrategy, ContextItem, Document, Metrics, Objective, PlanConfig, PlanExplanation, RunConstraints, TrialSummary } from "@/core/domain";
import type { QuestionRouter } from "@/engine/router";
import { resolvePlanClass } from "@/engine/router";
import type { OptimizerStrategy } from "@/engine/optimizer/strategies";
import { materialize, type RepresentationSet } from "@/engine/representations";
import { executePlan, prepareQuery } from "@/engine/executor";
import { aggregate, type Outcome } from "@/engine/evaluate";
import { embed, flushModelCaches, rerankScores, warmModels } from "@/engine/models";
import { DEFAULT_CALIBRATION, type Calibration } from "@/engine/cost";
import { planKey } from "@/engine/labels";
import { sha1 } from "@/engine/text";
import { embeddingModelsIn } from "@/engine/optimizer/space";
import { paretoFront, selectConfig, type Candidate } from "@/engine/optimizer/selection";
import { explainSelection } from "@/engine/optimizer/explain";
import type { PreparedQuery } from "@/engine/retrievers";
import type { HarnessQuestion, Scorer } from "./scorers";

const tick = () => new Promise<void>((r) => setImmediate(r));

export interface SearchInput {
  dataset: { version: string; documents: Document[] };
  questions: HarnessQuestion[];
  router: QuestionRouter;
  strategy: OptimizerStrategy;
  baselineConfig: PlanConfig;
  space: PlanConfig[];
  scorer: Scorer;
  calibrate?: boolean;
  /** Keep the returned context items per (config, question): needed for rank metrics, memory-heavy. */
  keepItems?: boolean;
  /** Store the distinct-document ranking per (config, question) for rank metrics (memory-light). Never affects scores. */
  rankOf?: (items: ContextItem[]) => string[];
  onProgress?: (stage: string, done: number, total: number) => void;
  onExperiment?: (row: Record<string, unknown>) => void;
  /** Instrumentation only: called after each representation is built. */
  onRepresentation?: (info: { chunking: ChunkingStrategy; chunks: number; vectors: Record<string, number>; ms: number }) => void;
  /** Instrumentation only: called immediately before V1's cache serialization (flushModelCaches), and after it succeeds or throws. */
  onCacheFlush?: (phase: "before" | "after" | "error", error?: unknown) => void;
}

export interface QOutcome extends Outcome {
  ids: string[];
  items?: ContextItem[];
  ranking?: string[];
}

export interface SearchResult {
  questions: HarnessQuestion[];
  trials: TrialSummary[];
  outcomes: Map<string, Map<string, QOutcome>>;
  routedClass: Map<string, string>;
  baselineKey: string;
  calibration: Calibration;
  chunks: Partial<Record<ChunkingStrategy, number>>;
  distinctBehaviors: number;
  timings: { representMs: number; searchMs: number };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Copy of the frozen runner's (non-exported) calibration; affects only estimated latency. */
async function calibrate(reps: RepresentationSet): Promise<Calibration> {
  await warmModels({ embed: true, rerank: true });
  const embedMs: number[] = [];
  for (let i = 0; i < 9; i++) {
    const t = performance.now();
    await embed("minilm-l6", [`calibration probe ${i}: who approved the rollback of the release`], { cache: false });
    embedMs.push(performance.now() - t);
  }
  const passages = reps.chunks.slice(0, 20).map((c) => c.content);
  const perPair: number[] = [];
  for (let i = 0; passages.length && i < 3; i++) {
    const t = performance.now();
    await rerankScores(`calibration probe ${i}: why did latency increase`, passages, { cache: false });
    perPair.push((performance.now() - t) / passages.length);
  }
  return {
    embedQueryMs: Number(median(embedMs).toFixed(2)),
    rerankPerPairMs: Number((perPair.length ? median(perPair) : DEFAULT_CALIBRATION.rerankPerPairMs).toFixed(3)),
    method: "median of uncached inferences after warm-up, measured on this machine at run start (CPU)",
  };
}

/** Search phase: evaluate every configuration on optimization questions only. */
export async function search(input: SearchInput): Promise<SearchResult> {
  const leaked = input.questions.filter((q) => q.split !== "optimization");
  if (leaked.length) throw new Error(`HOLDOUT ISOLATION: search() received ${leaked.length} non-optimization question(s)`);
  const questions = input.questions.filter((q) => input.scorer.isScorable(q));
  if (!questions.length) throw new Error("no scorable optimization questions");
  const progress = input.onProgress ?? (() => {});
  const { dataset, router } = input;

  const t0 = performance.now();
  const chunkings = [...new Set([...input.space, input.baselineConfig].map((c) => c.chunkingStrategy))];
  const models = embeddingModelsIn([...input.space, input.baselineConfig]);
  const reps = new Map<ChunkingStrategy, RepresentationSet>();
  progress("Building representations", 0, chunkings.length);
  for (const [i, ch] of chunkings.entries()) {
    const tr = performance.now();
    const rs = await materialize(dataset.documents, dataset.version, ch, models);
    reps.set(ch, rs);
    input.onRepresentation?.({
      chunking: ch,
      chunks: rs.chunks.length,
      vectors: Object.fromEntries(Object.entries(rs.vectors).map(([m, v]) => [m, v?.length ?? 0])),
      ms: performance.now() - tr,
    });
    progress("Building representations", i + 1, chunkings.length);
    await tick();
  }
  const representMs = performance.now() - t0;

  const calibration = input.calibrate === false ? DEFAULT_CALIBRATION : await calibrate(reps.values().next().value!);

  const prepared = new Map<string, PreparedQuery>();
  for (const [i, q] of questions.entries()) {
    prepared.set(q.id, await prepareQuery(q.question, models));
    progress("Embedding questions", i + 1, questions.length);
  }
  const routedClass = new Map(questions.map((q) => [q.id, router.route(q.question).class]));

  const t1 = performance.now();
  const outcomes = new Map<string, Map<string, QOutcome>>();
  const evalConfig = async (cfg: PlanConfig) => {
    const key = planKey(cfg);
    if (outcomes.has(key)) return outcomes.get(key)!;
    const rs = reps.get(cfg.chunkingStrategy)!;
    const out = new Map<string, QOutcome>();
    for (const q of questions) {
      const r = await executePlan(cfg, q.question, rs, { plan: { id: "trial", version: 0 }, prepared: prepared.get(q.id), calibration });
      const sc = input.scorer.score(r.items, q);
      const o: QOutcome = {
        recall: sc.recall,
        precision: sc.precision,
        success: sc.success,
        tokens: r.tokens,
        estimatedCostUsd: r.estimatedCostUsd,
        estimatedLatencyMs: r.estimatedLatencyMs,
        ids: r.items.map((i) => i.provenance.chunkId),
        ...(input.keepItems ? { items: r.items } : {}),
        ...(input.rankOf ? { ranking: input.rankOf(r.items) } : {}),
      };
      out.set(q.id, o);
      input.onExperiment?.({
        configKey: key,
        questionId: q.id,
        routedClass: routedClass.get(q.id),
        recall: o.recall,
        precision: o.precision,
        success: o.success,
        tokens: o.tokens,
        measuredLatencyMs: Number(r.measuredLatencyMs.toFixed(3)),
        retrievedChunkIds: o.ids,
      });
    }
    outcomes.set(key, out);
    return out;
  };

  await evalConfig(input.baselineConfig);
  const strategy = input.strategy;
  strategy.init(input.space);
  const trials: TrialSummary[] = [];
  progress("Searching configurations", 0, strategy.budget);
  for (let cfg = strategy.next(trials); cfg; cfg = strategy.next(trials)) {
    await evalConfig(cfg);
    const key = planKey(cfg);
    trials.push({ key, config: cfg, optimization: aggregate(questions.map((q) => outcomes.get(key)!.get(q.id)!)), pareto: false });
    progress("Searching configurations", trials.length, strategy.budget);
    if (trials.length % 8 === 0) await tick();
  }
  input.onCacheFlush?.("before");
  try {
    flushModelCaches();
  } catch (e) {
    input.onCacheFlush?.("error", e);
    throw e;
  }
  input.onCacheFlush?.("after");
  const front = paretoFront(trials.map((t) => ({ key: t.key, config: t.config, m: t.optimization })));
  for (const t of trials) t.pareto = front.has(t.key);
  const distinctBehaviors = new Set(trials.map((t) => sha1(questions.map((q) => outcomes.get(t.key)!.get(q.id)!.ids.join(",")).join("|")))).size;

  return {
    questions,
    trials,
    outcomes,
    routedClass,
    baselineKey: planKey(input.baselineConfig),
    calibration,
    chunks: Object.fromEntries([...reps.entries()].map(([k, v]) => [k, v.chunks.length])),
    distinctBehaviors,
    timings: { representMs, searchMs: performance.now() - t1 },
  };
}

export interface Selection {
  questionClass: string;
  questions: number;
  config: PlanConfig;
  metrics: Metrics;
  baseline: Metrics;
  explanation: PlanExplanation;
}

export function metricsOf(res: SearchResult, key: string, qs: HarnessQuestion[]): Metrics {
  return aggregate(qs.map((q) => res.outcomes.get(key)!.get(q.id)!));
}

/** Frozen selection procedure over a subset of trials and questions. */
export function selectOn(
  res: SearchResult,
  qs: HarnessQuestion[],
  questionClass: string,
  objective: Objective,
  constraints: RunConstraints = {},
  trialFilter: (c: PlanConfig) => boolean = () => true,
): Selection {
  const cands: Candidate[] = res.trials.filter((t) => trialFilter(t.config)).map((t) => ({ key: t.key, config: t.config, m: metricsOf(res, t.key, qs) }));
  const baseline = metricsOf(res, res.baselineKey, qs);
  const sel = selectConfig(cands, objective, constraints, baseline);
  return {
    questionClass,
    questions: qs.length,
    config: sel.winner.config,
    metrics: sel.winner.m,
    baseline,
    explanation: explainSelection({ questionClass, questions: qs.length, selected: sel.winner, candidates: cands, objective, constraints, baseline, within: sel.within }),
  };
}

export interface PlanSet {
  fallback: Selection;
  classes: Selection[];
  routed: Metrics;
}

/** Frozen RadarDB plan-set learning: fallback over all questions + one plan per routed class with ≥ minQ questions. */
export function learnPlans(
  res: SearchResult,
  router: QuestionRouter,
  objective: Objective,
  opts: { minClassQuestions?: number; classOf?: (q: HarnessQuestion) => string; classIds?: string[] } = {},
): PlanSet {
  const classOf = opts.classOf ?? ((q: HarnessQuestion) => res.routedClass.get(q.id)!);
  const classIds = opts.classIds ?? router.classes.map((c) => c.id);
  const fallback = selectOn(res, res.questions, "*", objective);
  const minQ = opts.minClassQuestions ?? 3;
  const classes: Selection[] = [];
  for (const c of classIds) {
    const qs = res.questions.filter((q) => classOf(q) === c);
    if (qs.length >= minQ) classes.push(selectOn(res, qs, c, objective));
  }
  const planFor = new Map(classes.map((c) => [c.questionClass, c.config]));
  const routedOutcomes = res.questions.map((q) => {
    const cls = opts.classOf ? (planFor.has(classOf(q)) ? classOf(q) : "*") : resolvePlanClass(router.route(q.question), planFor.keys(), router.fallbackThreshold);
    const cfg = cls === "*" ? fallback.config : planFor.get(cls)!;
    return res.outcomes.get(planKey(cfg))!.get(q.id)!;
  });
  return { fallback, classes, routed: aggregate(routedOutcomes) };
}
