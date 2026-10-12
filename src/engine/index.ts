/**
 * RadarDB engine — public API (stability: 0.x, see docs/API_REFERENCE.md).
 *
 * Everything exported here is the supported surface for embedding RadarDB's
 * retrieval engine in another program. Deep imports of individual modules
 * work but are not covered by compatibility guarantees. The engine has no
 * dependency on the server, UI or any hosted service.
 *
 * Stability labels:
 *   STABLE        — covered by tests/api-surface.test.ts; changes need a changelog entry
 *   EXPERIMENTAL  — the `experimental` namespace; may change in any release
 */

// ---- domain types and versioned schemas (STABLE) ----
export type * from "@/core/domain";
export {
  ChunkingStrategySchema,
  RetrievalStrategySchema,
  EmbeddingModelSchema,
  RerankerNameSchema,
  GraphStrategySchema,
  PlanConfigSchema,
  FusionPlanConfigSchema,
  PortablePlanReleaseSchema,
  PLAN_RELEASE_SCHEMA,
  PLAN_RELEASE_SCHEMA_VERSION,
  type PortablePlanRelease,
} from "@/core/schemas";
export { ENGINE_VERSION, toPortableRelease, parsePortableRelease, type ParseResult } from "@/core/portable";

// ---- documents → representations (STABLE) ----
export { CHUNKERS, FixedChunker, SectionChunker, SentenceWindowChunker, type Chunker } from "./chunkers";
export { materialize, datasetVersionOf, evictRepresentations, EntityGraph, type RepresentationSet } from "./representations";
export { BM25, denseSearch, rrf, type Hit } from "./indexes";
export { embed, rerankScores, warmModels, flushModelCaches, type ModelOptions } from "./models";
export { normalize, tokenize, estTokens } from "./text";
export { extractEntities } from "./entities";

// ---- retrieval → context (STABLE) ----
export { LexicalRetriever, VectorRetriever, HybridRetriever, ExactMatchBooster, EntityGraphRetriever, retrieverFor, type Retriever, type Candidate, type PreparedQuery } from "./retrievers";
export { NoReranker, CrossEncoderReranker, rerankerFor, type Reranker, type RerankResult } from "./rerankers";
export { ContextAssembler, type AssembleOptions, type AssembleResult } from "./assembler";
export { executePlan, prepareQuery, embeddingsFor, type ExecuteOptions, type ExecutionResult } from "./executor";
export { planKey, describePlan, shortPlan, familyOf } from "./labels";

// ---- evaluation and optimization (STABLE) ----
export { scoreContext, aggregate, wilson, latencyStats, type ContextScore, type Outcome } from "./evaluate";
export { computeIntegrity } from "./integrity";
export { optimize, type OptimizeInput, type OptimizeOutput, type OptimizeHooks, type Dataset } from "./optimizer/runner";
export { validatePlans, type ValidateInput, type ValidateOutput } from "./optimizer/validate";
export { selectConfig, paretoFront, withinConstraints, type Candidate as SelectionCandidate, type Selection } from "./optimizer/selection";
export { enumerateSpace, BASELINE_CONFIG, SEARCH_SPACE } from "./optimizer/space";
export { ExhaustiveSearch, RandomSearch, strategyFor, type OptimizerStrategy } from "./optimizer/strategies";
export { RuleBasedRouter, demoRouter, resolvePlanClass, DEMO_CLASSES, type QuestionRouter } from "./router";
export { estimateCostUsd, estimateLatencyMs, COST_MODEL, DEFAULT_CALIBRATION, type Calibration } from "./cost";

// ---- reproducibility (STABLE) ----
export { createExperimentManifest, questionSetHash, searchSpaceHash, type ExperimentManifest } from "./manifest";

// ---- V1.1 research components (EXPERIMENTAL) ----
import * as fusion from "./v11/fusion";
import * as v11Objective from "./v11/objective";
import * as v11Portfolio from "./v11/portfolio";
/**
 * EXPERIMENTAL. FusionContextPlan and the V1.1 global-plan objective, validated in
 * locked offline evaluations (docs/BENCHMARK_REPRODUCIBILITY.md). Not yet executed by /api/v1/context.
 */
export const experimental = { fusion, objective: v11Objective, portfolio: v11Portfolio } as const;
