import { z } from "zod";

const evidence = z.union([z.string().trim().min(1).max(500), z.array(z.string().trim().min(1).max(500)).min(1).max(10)]);

export const ContextRequestSchema = z
  .object({
    query: z.string().trim().min(1, "query is required").max(2000, "query is limited to 2000 characters"),
    constraints: z
      .object({
        maxTokens: z.number().int().min(50).max(100_000).optional(),
        maxLatencyMs: z.number().int().min(1).max(60_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const FeedbackSchema = z
  .object({
    requestId: z.string().min(1).max(100),
    useful: z.boolean(),
    missingEvidence: z.string().max(2000).optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();

export const RunSchema = z
  .object({
    objective: z.enum(["balanced", "quality", "cost", "latency"]).default("balanced"),
    strategy: z.enum(["exhaustive", "random"]).default("exhaustive"),
    samples: z.number().int().min(5).max(1000).optional(),
    constraints: z
      .object({
        maxTokens: z.number().positive().nullable().optional(),
        maxCostUsd: z.number().positive().nullable().optional(),
        maxLatencyMs: z.number().positive().nullable().optional(),
      })
      .default({}),
  })
  .strict();

export const QuestionSchema = z
  .object({
    question: z.string().trim().min(3).max(1000),
    requiredEvidence: z.array(evidence).min(1).max(20),
    questionClass: z.string().max(50).optional(),
  })
  .strict();

export const UploadSchema = z
  .object({
    title: z.string().max(200).default(""),
    content: z.string().min(1).max(1_000_000),
  })
  .strict();

export const SourceSchema = z
  .object({
    type: z.literal("filesystem"),
    name: z.string().max(100).default(""),
    path: z.string().trim().min(1).max(500),
  })
  .strict();

export const DeploySchema = z.object({ releaseId: z.string().min(1).max(100) }).strict();

export const PlaygroundSchema = ContextRequestSchema;

/** Benchmark the workspace's own documents and eval set (keeps their persisted splits). */
export const WorkspaceBenchmarkSchema = z
  .object({
    name: z.string().max(120).default(""),
    objective: z.enum(["balanced", "quality", "cost", "latency"]).optional(),
    fromWorkspace: z.literal(true),
  })
  .strict();

export const BenchmarkSchema = z
  .object({
    name: z.string().max(120).default(""),
    objective: z.enum(["balanced", "quality", "cost", "latency"]).optional(),
    documents: z
      .array(z.object({ title: z.string().max(300).default(""), content: z.string().min(1).max(2_000_000), path: z.string().max(500).optional() }))
      .min(1)
      .max(2000),
    questions: z
      .array(
        z.object({
          question: z.string().trim().min(3).max(1000),
          requiredEvidence: z.array(evidence).max(20).optional(),
          questionClass: z.string().max(50).optional(),
          split: z.enum(["optimization", "validation"]).optional(),
        }),
      )
      .min(3)
      .max(500),
  })
  .strict();
