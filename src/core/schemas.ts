/**
 * Versioned, runtime-validated configuration schemas (public contract).
 *
 * These mirror the TypeScript types in `domain.ts` exactly and are the format
 * used for anything that leaves a workspace: exported plans, CLI files, and
 * future cloud import. Bump `PLAN_RELEASE_SCHEMA_VERSION` only with a
 * migration in `portable.ts`.
 */
import { z } from "zod";

export const ChunkingStrategySchema = z.enum(["fixed-512", "fixed-256", "section", "sentence-window"]);
export const RetrievalStrategySchema = z.enum(["lexical", "vector", "hybrid"]);
export const EmbeddingModelSchema = z.enum(["minilm-l6", "hash-ngram"]);
export const RerankerNameSchema = z.enum(["none", "cross-encoder"]);
export const GraphStrategySchema = z.enum(["none", "entity-expansion"]);

/** One retrieval configuration (single ContextPlan). */
export const PlanConfigSchema = z
  .object({
    chunkingStrategy: ChunkingStrategySchema,
    retrievalStrategy: RetrievalStrategySchema,
    embeddingModel: EmbeddingModelSchema.nullable(),
    exactMatchBoost: z.boolean(),
    graphStrategy: GraphStrategySchema,
    reranker: RerankerNameSchema,
    topK: z.number().int().min(1).max(50),
  })
  .strict()
  .refine((c) => c.retrievalStrategy === "lexical" || c.embeddingModel !== null, {
    message: "vector and hybrid retrieval require an embeddingModel",
    path: ["embeddingModel"],
  });

/** Two-plan fusion (V1.1B FusionContextPlan). EXPERIMENTAL: engine-level, not yet served by /api/v1/context. */
export const FusionPlanConfigSchema = z
  .object({
    kind: z.literal("fusion"),
    version: z.literal(1),
    primary: PlanConfigSchema,
    partner: PlanConfigSchema,
    rrfK: z.number().int().min(1).max(1000),
    sharedRerank: z.enum(["none", "cross-encoder"]),
    rerankPool: z.number().int().min(1).max(200),
  })
  .strict();

const MetricsSchema = z
  .object({
    n: z.number().int().min(0),
    evidenceCoverage: z.number(),
    retrievalSuccess: z.number(),
    retrievalSuccessCI: z.tuple([z.number(), z.number()]),
    contextPrecision: z.number(),
    contextTokens: z.number(),
    estimatedCostUsd: z.number(),
    estimatedLatencyMs: z.number(),
  });

export const PLAN_RELEASE_SCHEMA = "radardb.plan-release";
export const PLAN_RELEASE_SCHEMA_VERSION = 1;

/** Portable plan release: what `radar plan export` and GET /api/plans/export produce. */
export const PortablePlanReleaseSchema = z
  .object({
    schema: z.literal(PLAN_RELEASE_SCHEMA),
    schemaVersion: z.literal(PLAN_RELEASE_SCHEMA_VERSION),
    exportedAt: z.string(),
    engine: z.object({ name: z.literal("radardb"), version: z.string() }).strict(),
    release: z
      .object({
        version: z.number().int().min(1),
        datasetVersion: z.string(),
        routerVersion: z.string(),
        createdAt: z.string(),
      })
      .strict(),
    plans: z
      .array(
        z
          .object({
            /** Workload class, or "*" for the fallback plan. */
            questionClass: z.string().min(1),
            config: PlanConfigSchema,
            optimizationMetrics: MetricsSchema.nullable(),
            validationMetrics: MetricsSchema.nullable(),
            confidence: z.object({ level: z.enum(["low", "medium", "high"]), reason: z.string() }).strict(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine((r) => r.plans.filter((p) => p.questionClass === "*").length === 1, { message: "exactly one fallback plan (questionClass \"*\") is required", path: ["plans"] });

export type PortablePlanRelease = z.infer<typeof PortablePlanReleaseSchema>;
