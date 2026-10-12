import type { ContextItem, EmbeddingModel, PlanConfig, TraceStep } from "@/core/domain";
import type { RepresentationSet } from "./representations";
import { EntityGraphRetriever, retrieverFor, type Candidate, type PreparedQuery } from "./retrievers";
import { rerankerFor } from "./rerankers";
import { ContextAssembler } from "./assembler";
import { embed } from "./models";
import { extractEntities } from "./entities";
import { tokenize } from "./text";
import { DEFAULT_CALIBRATION, estimateCostUsd, estimateLatencyMs, type Calibration } from "./cost";
import { describePlan } from "./labels";

export interface ExecuteOptions {
  plan: { id: string; version: number };
  maxTokens?: number;
  maxLatencyMs?: number;
  /** false = bypass embedding/rerank caches (real inference). Default true. */
  cache?: boolean;
  calibration?: Calibration;
  /** Pre-embedded query (optimizer reuses one embedding per question). */
  prepared?: PreparedQuery;
}

export interface ExecutionResult {
  config: PlanConfig;
  items: ContextItem[];
  trace: TraceStep[];
  tokens: number;
  rerankPairs: number;
  degradations: string[];
  /** Wall-clock time of this execution (includes model inference unless served from cache). */
  measuredLatencyMs: number;
  estimatedLatencyMs: number;
  estimatedCostUsd: number;
}

export function embeddingsFor(config: PlanConfig): EmbeddingModel[] {
  return config.retrievalStrategy !== "lexical" && config.embeddingModel ? [config.embeddingModel] : [];
}

export async function prepareQuery(text: string, models: EmbeddingModel[], cache = true): Promise<PreparedQuery> {
  const vectors: PreparedQuery["vectors"] = {};
  for (const m of models) vectors[m] = (await embed(m, [text], { cache }))[0];
  return { text, tokens: tokenize(text), entities: extractEntities(text), vectors };
}

const graphRetriever = new EntityGraphRetriever();
const assembler = new ContextAssembler();

/**
 * Executes one ContextPlan configuration: retrieve → (rerank) → top-k →
 * (graph expansion) → assemble under the token budget. The single code path
 * used by the optimizer, validation, the Playground and /api/v1/context.
 */
export async function executePlan(config: PlanConfig, query: string, reps: RepresentationSet, opts: ExecuteOptions): Promise<ExecutionResult> {
  const cal = opts.calibration ?? DEFAULT_CALIBRATION;
  const trace: TraceStep[] = [];
  const degradations: string[] = [];
  const t0 = performance.now();
  let nonModelMs = 0;
  const step = async <T>(name: string, fn: () => T | Promise<T>, detail: (r: T) => string, model = false): Promise<T> => {
    const s = performance.now();
    const r = await fn();
    const ms = performance.now() - s;
    if (!model) nonModelMs += ms;
    trace.push({ step: name, detail: detail(r), ms: Number(ms.toFixed(2)) });
    return r;
  };

  const q =
    opts.prepared ??
    (await step(
      "embed query",
      () => prepareQuery(query, embeddingsFor(config), opts.cache !== false),
      () => (embeddingsFor(config).length ? embeddingsFor(config).join(", ") : "not needed (lexical)"),
      true,
    ));

  const reranker = rerankerFor(config.reranker);
  let useRerank = reranker.name !== "none";
  if (useRerank && opts.maxLatencyMs != null) {
    const projected = performance.now() - t0 + reranker.pool * cal.rerankPerPairMs;
    if (projected > opts.maxLatencyMs) {
      useRerank = false;
      degradations.push(`reranker skipped: projected ${Math.round(projected)} ms exceeds maxLatencyMs ${opts.maxLatencyMs}`);
    }
  }

  const retriever = retrieverFor(config);
  const pool = useRerank ? Math.max(reranker.pool, config.topK) : config.topK;
  let ranked: Candidate[] = await step(
    "retrieve",
    () => retriever.retrieve(q, reps, pool),
    (r) => `${retriever.name} → ${r.length} candidates`,
  );

  let rerankPairs = 0;
  if (useRerank) {
    const res = await step(
      "rerank",
      () => reranker.rerank(q.text, ranked, reps, { cache: opts.cache !== false }),
      (r) => `cross-encoder over ${r.pairs} pairs`,
      true,
    );
    ranked = res.candidates;
    rerankPairs = res.pairs;
  }

  let selected = ranked.slice(0, config.topK);
  if (config.graphStrategy === "entity-expansion") {
    const extra = await step(
      "graph expansion",
      () => graphRetriever.expand(selected, reps, Math.ceil(config.topK / 2)),
      (r) => `${r.length} linked chunks via rare identifiers`,
    );
    selected = [...selected, ...extra];
  }

  const assembled = await step(
    "assemble",
    () => assembler.assemble(selected, reps, { maxTokens: opts.maxTokens, plan: opts.plan }),
    (r) =>
      `${r.items.length} items` +
      (r.droppedDuplicates ? `, ${r.droppedDuplicates} duplicate(s) removed` : "") +
      (r.droppedForBudget ? `, ${r.droppedForBudget} dropped for token budget` : ""),
  );
  if (assembled.droppedForBudget) degradations.push(`${assembled.droppedForBudget} item(s) dropped to fit maxTokens ${opts.maxTokens}`);

  const tokens = assembled.items.reduce((s, i) => s + i.tokens, 0);
  const effective = useRerank ? config : { ...config, reranker: "none" as const };
  return {
    config: effective,
    items: assembled.items,
    trace: [{ step: "plan", detail: describePlan(effective).join(" · "), ms: 0 }, ...trace],
    tokens,
    rerankPairs,
    degradations,
    measuredLatencyMs: performance.now() - t0,
    estimatedLatencyMs: estimateLatencyMs(effective, nonModelMs, rerankPairs, cal),
    estimatedCostUsd: estimateCostUsd(effective, tokens, rerankPairs),
  };
}
