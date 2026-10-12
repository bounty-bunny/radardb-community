/**
 * RadarDB domain model. Pure types: safe to import from client and server.
 *
 * Workload (question) classes are data, not a closed union. The demo router
 * defines four; nothing in the engine depends on which classes exist.
 */

// ---------- Sources & documents ----------

export type SourceType = "fixture" | "filesystem" | "upload";

/** Display kind of the system a document came from (icon + label only). */
export type SourceKind = "confluence" | "pagerduty" | "deployctl" | "github" | "jira" | "slack" | "markdown" | "upload";

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  kind: SourceKind;
  /** Non-secret connection metadata, e.g. { path: "sources/runbooks" }. Never holds credentials. */
  connection: Record<string, string>;
  syncStatus: "never" | "syncing" | "synced" | "error";
  syncError?: string;
  lastSyncedAt?: string;
  documentCount: number;
  /** Synthetic demo data; never presented as a live integration. */
  synthetic: boolean;
  permissions: { model: "none" | "source-acl"; note: string };
  createdAt: string;
}

export interface Document {
  id: string;
  sourceId: string;
  /** Identifier in the source system (file path, page id, ...). */
  externalId: string;
  content: string;
  metadata: {
    title: string;
    kind: SourceKind;
    /** Generated distractor in a synthetic fixture (used by integrity checks). */
    distractor?: boolean;
    [k: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
  checksum: string;
}

export type ChunkingStrategy = "fixed-512" | "fixed-256" | "section" | "sentence-window";

export interface Chunk {
  id: string;
  documentId: string;
  strategy: ChunkingStrategy;
  content: string;
  tokenCount: number;
  metadata: {
    index: number;
    title: string;
    sourceId: string;
    sourceKind: SourceKind;
    entities: string[];
  };
}

export type RepresentationType = "chunk-set" | "lexical-index" | "vector-index" | "entity-graph";

export interface Representation {
  id: string;
  type: RepresentationType;
  configuration: Record<string, string | number>;
  /** Dataset version (hash of documents) this representation was built from. */
  sourceVersion: string;
  generatedAt: string;
  stats: Record<string, number>;
}

// ---------- Evaluation ----------

/** A required piece of evidence. An array means "any one of these phrasings". */
export type Evidence = string | string[];

export type Split = "optimization" | "validation";

export interface EvalQuestion {
  id: string;
  question: string;
  /** Labeled workload class (human or fixture label). Routing at serve time uses the router, not this field. */
  questionClass: string;
  requiredEvidence: Evidence[];
  /** Assigned once at creation and persisted. Never recomputed. */
  split: Split;
  provenance: "fixture" | "manual" | "benchmark";
  humanVerified: boolean;
  createdAt: string;
}

export interface WorkloadClass {
  id: string;
  label: string;
  description: string;
}

export interface RouteDecision {
  class: string;
  confidence: number;
  signals: string[];
}

// ---------- Plans ----------

export type RetrievalStrategy = "lexical" | "vector" | "hybrid";
export type EmbeddingModel = "minilm-l6" | "hash-ngram";
export type RerankerName = "none" | "cross-encoder";
export type GraphStrategy = "none" | "entity-expansion";

export interface PlanConfig {
  chunkingStrategy: ChunkingStrategy;
  retrievalStrategy: RetrievalStrategy;
  embeddingModel: EmbeddingModel | null;
  /** Boost chunks containing rare identifiers from the query (tickets, deploys, commits, PRs, versions). */
  exactMatchBoost: boolean;
  graphStrategy: GraphStrategy;
  reranker: RerankerName;
  topK: number;
}

/**
 * Aggregated retrieval metrics. Measured vs estimated is explicit in the
 * field names: nothing estimated is ever stored in a `measured*` field.
 */
export interface Metrics {
  n: number;
  /** Mean share of required evidence present in the context. */
  evidenceCoverage: number;
  /** Share of questions whose context contains all required evidence. */
  retrievalSuccess: number;
  /** Wilson 95% interval for retrievalSuccess. */
  retrievalSuccessCI: [number, number];
  /** Mean share of returned context items that contain required evidence. */
  contextPrecision: number;
  contextTokens: number;
  /** Modeled: LLM input cost of the context + reranker compute. See cost.ts. */
  estimatedCostUsd: number;
  /** Modeled from per-step timings calibrated on this machine. */
  estimatedLatencyMs: number;
}

export interface LatencyStats {
  n: number;
  p50: number;
  p95: number;
  mean: number;
  /** How it was measured, e.g. "cold model inference, in-process, this machine". */
  method: string;
}

export type PlanStatus = "candidate" | "validated" | "deployed" | "retired";

export interface ExplainRow {
  label: string;
  config: PlanConfig;
  metrics: Metrics;
  selected: boolean;
}

export interface PlanExplanation {
  questionClass: string;
  optimizationQuestions: number;
  configurationsEvaluated: number;
  configurationsWithinConstraints: number;
  /** Best configuration per retrieval family on this class's optimization questions. */
  alternatives: ExplainRow[];
  /** Selected plan with one component toggled. */
  ablations: { change: string; metrics: Metrics }[];
  reasons: string[];
}

export interface ContextPlan {
  id: string;
  /** Version of the plan set (release) this plan belongs to. */
  version: number;
  /** Workload class this plan serves, or "*" for the fallback plan. */
  questionClass: string;
  config: PlanConfig;
  filters: { sourceIds?: string[] };
  /** Optimization-set metrics for this class. */
  metrics: Metrics;
  /** Held-out metrics for this class. Null until validation runs. */
  validationMetrics: Metrics | null;
  confidence: { level: "low" | "medium" | "high"; reason: string };
  status: PlanStatus;
  runId: string;
  explanation: PlanExplanation;
  createdAt: string;
  deployedAt?: string;
}

/** An immutable, versioned set of plans deployed together (one per class + fallback). */
export interface PlanRelease {
  id: string;
  version: number;
  runId: string;
  datasetVersion: string;
  routerVersion: string;
  planIds: Record<string, string>;
  fallbackPlanId: string;
  status: PlanStatus;
  createdAt: string;
  validatedAt?: string;
  deployedAt?: string;
  retiredAt?: string;
  optimization: { questions: number; metrics: Metrics; baseline: Metrics };
  validation: {
    questions: number;
    metrics: Metrics;
    baseline: Metrics;
    measuredLatency: LatencyStats | null;
    baselineMeasuredLatency: LatencyStats | null;
    perClass: Record<string, { metrics: Metrics; baseline: Metrics }>;
  } | null;
}

// ---------- Optimizer ----------

export type Objective = "balanced" | "quality" | "cost" | "latency";

export interface RunConstraints {
  maxTokens?: number | null;
  maxCostUsd?: number | null;
  maxLatencyMs?: number | null;
}

export interface TrialSummary {
  key: string;
  config: PlanConfig;
  /** Optimization-set metrics only. */
  optimization: Metrics;
  pareto: boolean;
}

export interface IntegrityIssue {
  kind: string;
  detail: string;
}

export interface IntegrityReport {
  optimizationQuestions: number;
  validationQuestions: number;
  duplicateQuestions: IntegrityIssue[];
  nearDuplicatesAcrossSplits: IntegrityIssue[];
  templateRepeatsAcrossSplits: IntegrityIssue[];
  evidenceInQuestionText: IntegrityIssue[];
  distractorLeakage: IntegrityIssue[];
  missingEvidence: IntegrityIssue[];
  duplicateDocuments: IntegrityIssue[];
  duplicateSources: IntegrityIssue[];
  identifierCollisions: IntegrityIssue[];
  /** Questions with no required evidence cannot be scored and are excluded. */
  unscorableQuestions: IntegrityIssue[];
  passed: boolean;
}

export interface OptimizerRun {
  id: string;
  datasetVersion: string;
  routerVersion: string;
  strategy: { name: string; params: Record<string, number | string> };
  objective: Objective;
  constraints: RunConstraints;
  status: "running" | "completed" | "failed";
  error?: string;
  startedAt: string;
  completedAt?: string;
  progress: { stage: string; done: number; total: number };
  searchSpaceSize: number;
  configurationsTested: number;
  /** Configurations whose retrieved chunks differ on at least one optimization question. */
  distinctBehaviors: number;
  optimizationSet: string[];
  validationSet: string[];
  corpus: { documents: number; chunks: Partial<Record<ChunkingStrategy, number>> };
  calibration?: { embedQueryMs: number; rerankPerPairMs: number; method: string };
  baselineConfig: PlanConfig;
  baseline?: { optimization: Metrics };
  trials: TrialSummary[];
  candidateReleaseId?: string;
  integrity?: IntegrityReport;
  /** Per held-out question outcome, computed after selection (reporting only). */
  validationResults?: {
    questionId: string;
    planClass: string;
    plan: { recall: number; success: boolean; tokens: number };
    baseline: { recall: number; success: boolean; tokens: number };
  }[];
}

// ---------- Benchmark ----------

export interface BenchmarkReport {
  generatedAt: string;
  datasetVersion: string;
  documents: number;
  questions: { optimization: number; validation: number; unscored: number };
  objective: Objective;
  baselineConfig: PlanConfig;
  optimization: { baseline: Metrics; radar: Metrics };
  validation: {
    baseline: Metrics;
    radar: Metrics;
    measuredLatency: LatencyStats | null;
    baselineMeasuredLatency: LatencyStats | null;
  };
  perClass: { questionClass: string; label: string; optimizationQuestions: number; validation: { baseline: Metrics; radar: Metrics } | null; plan: PlanConfig; reasons: string[] }[];
  fallbackPlan: PlanConfig;
  integrity: IntegrityReport;
  configurationsTested: number;
  calibration: { embedQueryMs: number; rerankPerPairMs: number; method: string };
}

export interface Benchmark {
  id: string;
  name: string;
  createdAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  error?: string;
  progress: { stage: string; done: number; total: number };
  report?: BenchmarkReport;
}

/** One configuration on one question. Persisted for every experiment (future learned optimizer). */
export interface ExperimentResult {
  runId: string;
  configKey: string;
  config: PlanConfig;
  questionId: string;
  split: Split;
  routedClass: string;
  evidenceRecall: number;
  contextPrecision: number;
  success: boolean;
  tokens: number;
  measuredLatencyMs: number;
  estimatedLatencyMs: number;
  estimatedCostUsd: number;
  retrievedEvidence: boolean[];
  retrievedChunkIds: string[];
  features: { questionChars: number; questionEntities: number; corpusDocuments: number; corpusChunks: number };
}

// ---------- Serving ----------

export interface Provenance {
  sourceId: string;
  sourceKind: SourceKind;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  method: "lexical" | "vector" | "hybrid" | "exact-match" | "graph-expansion";
  retrievalScore: number;
  rerankScore?: number;
  rank: number;
  graphPath?: { fromChunkId: string; entity: string }[];
  planId: string;
  planVersion: number;
  /** Set by a FusionContextPlan: which branch supplied this item and which branches retrieved its document. */
  fusion?: FusionProvenance;
}

export interface FusionProvenance {
  branch: "primary" | "partner";
  document: "primary-only" | "partner-only" | "both";
  primaryDocRank?: number;
  partnerDocRank?: number;
  fusedScore: number;
}

export interface ContextItem {
  text: string;
  tokens: number;
  provenance: Provenance;
}

export interface TraceStep {
  step: string;
  detail: string;
  ms: number;
}

export interface ContextRequest {
  id: string;
  timestamp: string;
  /** Stored only when query logging is enabled (default on for local use). */
  query?: string;
  queryChars: number;
  detectedClass: string;
  routerConfidence: number;
  routerSignals: string[];
  fallbackUsed: boolean;
  releaseVersion: number;
  planId: string;
  planVersion: number;
  constraints: { maxTokens?: number; maxLatencyMs?: number };
  degradations: string[];
  measuredLatencyMs: number;
  tokenCount: number;
  estimatedCostUsd: number;
  /** References only. Document content is never persisted in traces. */
  items: { chunkId: string; documentId: string; sourceId: string; method: Provenance["method"]; score: number; rerankScore?: number }[];
}

export interface Feedback {
  id: string;
  requestId: string;
  useful: boolean;
  missingEvidence?: string;
  note?: string;
  createdAt: string;
}
