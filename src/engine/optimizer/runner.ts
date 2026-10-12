import type {
  ChunkingStrategy,
  Document,
  EvalQuestion,
  ExperimentResult,
  Metrics,
  Objective,
  PlanConfig,
  PlanExplanation,
  RunConstraints,
  TrialSummary,
} from "@/core/domain";
import { resolvePlanClass, type QuestionRouter } from "../router";
import type { OptimizerStrategy } from "./strategies";
import { materialize, type RepresentationSet } from "../representations";
import { executePlan, prepareQuery } from "../executor";
import { aggregate, scoreContext, type Outcome } from "../evaluate";
import { embed, flushModelCaches, rerankScores, warmModels } from "../models";
import { DEFAULT_CALIBRATION, type Calibration } from "../cost";
import { planKey } from "../labels";
import { sha1 } from "../text";
import { embeddingModelsIn } from "./space";
import { paretoFront, selectConfig, type Candidate } from "./selection";
import { explainSelection } from "./explain";
import type { PreparedQuery } from "../retrievers";

const tick = () => new Promise<void>((r) => setImmediate(r));

export interface Dataset {
  version: string;
  documents: Document[];
}

export interface OptimizeInput {
  runId: string;
  dataset: Dataset;
  /** Optimization questions ONLY. The runner refuses anything else. */
  questions: EvalQuestion[];
  router: QuestionRouter;
  strategy: OptimizerStrategy;
  objective: Objective;
  constraints: RunConstraints;
  baselineConfig: PlanConfig;
  space: PlanConfig[];
  /** A class needs at least this many optimization questions to get its own plan. */
  minClassQuestions?: number;
  /** Measure model inference timings on this machine (default true). */
  calibrate?: boolean;
}

export interface OptimizeHooks {
  progress?: (stage: string, done: number, total: number) => void;
  trials?: (trials: TrialSummary[]) => void;
  experiments?: (rows: ExperimentResult[]) => void;
}

export interface ClassSelection {
  questionClass: string;
  questions: number;
  config: PlanConfig;
  metrics: Metrics;
  baseline: Metrics;
  explanation: PlanExplanation;
}

export interface OptimizeOutput {
  trials: TrialSummary[];
  configurationsTested: number;
  distinctBehaviors: number;
  chunks: Partial<Record<ChunkingStrategy, number>>;
  calibration: Calibration;
  baseline: Metrics;
  /** Plan for questions the router can't place confidently, or classes too small to learn. */
  fallback: ClassSelection;
  classes: ClassSelection[];
  /** The routed plan set evaluated on the optimization set (router decides the class, as in production). */
  routed: Metrics;
}

interface QOutcome extends Outcome {
  ids: string[];
  hits: boolean[];
  measuredMs: number;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Median of repeated, uncached model inferences on this machine (after warm-up). */
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

/**
 * Searches the configuration space on the optimization set and selects one
 * plan per workload class plus a fallback. Validation is a separate step
 * (validate.ts) that runs after selection and cannot influence it.
 */
export async function optimize(input: OptimizeInput, hooks: OptimizeHooks = {}): Promise<OptimizeOutput> {
  const leaked = input.questions.filter((q) => q.split !== "optimization");
  if (leaked.length) throw new Error(`optimize() received ${leaked.length} non-optimization question(s); held-out data must never reach selection`);
  const questions = input.questions.filter((q) => q.requiredEvidence.length > 0);
  if (!questions.length) throw new Error("no scorable optimization questions");
  const progress = hooks.progress ?? (() => {});
  const { dataset, router } = input;

  // 1. Represent
  const chunkings = [...new Set([...input.space, input.baselineConfig].map((c) => c.chunkingStrategy))];
  const models = embeddingModelsIn([...input.space, input.baselineConfig]);
  const reps = new Map<ChunkingStrategy, RepresentationSet>();
  progress("Building representations", 0, chunkings.length);
  for (const [i, ch] of chunkings.entries()) {
    reps.set(ch, await materialize(dataset.documents, dataset.version, ch, models));
    progress("Building representations", i + 1, chunkings.length);
    await tick();
  }

  progress("Calibrating latency", 0, 1);
  const calibration = input.calibrate === false ? DEFAULT_CALIBRATION : await calibrate(reps.values().next().value!);

  progress("Embedding questions", 0, questions.length);
  const prepared = new Map<string, PreparedQuery>();
  for (const [i, q] of questions.entries()) {
    prepared.set(q.id, await prepareQuery(q.question, models));
    progress("Embedding questions", i + 1, questions.length);
  }
  const routedClass = new Map(questions.map((q) => [q.id, router.route(q.question).class]));
  const corpusChunks = (ch: ChunkingStrategy) => reps.get(ch)!.chunks.length;

  // 2. Retrieve + measure
  const results = new Map<string, Map<string, QOutcome>>();
  const evalConfig = async (cfg: PlanConfig) => {
    const key = planKey(cfg);
    if (results.has(key)) return results.get(key)!;
    const rs = reps.get(cfg.chunkingStrategy)!;
    const out = new Map<string, QOutcome>();
    const rows: ExperimentResult[] = [];
    for (const q of questions) {
      const r = await executePlan(cfg, q.question, rs, { plan: { id: "trial", version: 0 }, prepared: prepared.get(q.id), calibration });
      const sc = scoreContext(r.items.map((i) => i.text), q.requiredEvidence);
      const o: QOutcome = {
        recall: sc.recall,
        precision: sc.precision,
        success: sc.success,
        tokens: r.tokens,
        estimatedCostUsd: r.estimatedCostUsd,
        estimatedLatencyMs: r.estimatedLatencyMs,
        ids: r.items.map((i) => i.provenance.chunkId),
        hits: sc.hits,
        measuredMs: r.measuredLatencyMs,
      };
      out.set(q.id, o);
      rows.push({
        runId: input.runId,
        configKey: key,
        config: cfg,
        questionId: q.id,
        split: "optimization",
        routedClass: routedClass.get(q.id)!,
        evidenceRecall: o.recall,
        contextPrecision: o.precision,
        success: o.success,
        tokens: o.tokens,
        measuredLatencyMs: Number(o.measuredMs.toFixed(3)),
        estimatedLatencyMs: Number(o.estimatedLatencyMs.toFixed(3)),
        estimatedCostUsd: o.estimatedCostUsd,
        retrievedEvidence: o.hits,
        retrievedChunkIds: o.ids,
        features: {
          questionChars: q.question.length,
          questionEntities: prepared.get(q.id)!.entities.length,
          corpusDocuments: dataset.documents.length,
          corpusChunks: corpusChunks(cfg.chunkingStrategy),
        },
      });
    }
    results.set(key, out);
    hooks.experiments?.(rows);
    return out;
  };
  const metricsOf = (key: string, qs: EvalQuestion[]) => aggregate(qs.map((q) => results.get(key)!.get(q.id)!));

  const baselineKey = planKey(input.baselineConfig);
  await evalConfig(input.baselineConfig);

  const strategy = input.strategy;
  strategy.init(input.space);
  const trials: TrialSummary[] = [];
  progress("Searching configurations", 0, strategy.budget);
  for (let cfg = strategy.next(trials); cfg; cfg = strategy.next(trials)) {
    await evalConfig(cfg);
    const key = planKey(cfg);
    trials.push({ key, config: cfg, optimization: metricsOf(key, questions), pareto: false });
    progress("Searching configurations", trials.length, strategy.budget);
    if (trials.length % 8 === 0) {
      hooks.trials?.(trials.slice());
      await tick();
    }
  }
  flushModelCaches();
  const front = paretoFront(trials.map((t) => ({ key: t.key, config: t.config, m: t.optimization })));
  for (const t of trials) t.pareto = front.has(t.key);
  hooks.trials?.(trials);

  const distinctBehaviors = new Set(
    trials.map((t) => sha1(questions.map((q) => results.get(t.key)!.get(q.id)!.ids.join(",")).join("|"))),
  ).size;

  // 3. Learn: fallback over all optimization questions, then one plan per routed class.
  progress("Selecting plans", 0, 1);
  const select = (qs: EvalQuestion[], questionClass: string): ClassSelection => {
    const cands: Candidate[] = trials.map((t) => ({ key: t.key, config: t.config, m: metricsOf(t.key, qs) }));
    const baseline = metricsOf(baselineKey, qs);
    const sel = selectConfig(cands, input.objective, input.constraints, baseline);
    return {
      questionClass,
      questions: qs.length,
      config: sel.winner.config,
      metrics: sel.winner.m,
      baseline,
      explanation: explainSelection({
        questionClass,
        questions: qs.length,
        selected: sel.winner,
        candidates: cands,
        objective: input.objective,
        constraints: input.constraints,
        baseline,
        within: sel.within,
      }),
    };
  };
  const fallback = select(questions, "*");
  const minQ = input.minClassQuestions ?? 3;
  const classes: ClassSelection[] = [];
  for (const c of router.classes) {
    const qs = questions.filter((q) => routedClass.get(q.id) === c.id);
    if (qs.length >= minQ) classes.push(select(qs, c.id));
  }

  // Routed plan set on the optimization set, routing exactly as the data plane does.
  const planFor = new Map(classes.map((c) => [c.questionClass, c.config]));
  const routedOutcomes = questions.map((q) => {
    const cls = resolvePlanClass(router.route(q.question), planFor.keys(), router.fallbackThreshold);
    const cfg = cls === "*" ? fallback.config : planFor.get(cls)!;
    return results.get(planKey(cfg))!.get(q.id)!;
  });
  progress("Selecting plans", 1, 1);

  return {
    trials,
    configurationsTested: trials.length,
    distinctBehaviors,
    chunks: Object.fromEntries([...reps.entries()].map(([k, v]) => [k, v.chunks.length])),
    calibration,
    baseline: metricsOf(baselineKey, questions),
    fallback,
    classes,
    routed: aggregate(routedOutcomes),
  };
}
