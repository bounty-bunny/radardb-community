/**
 * Reproducible experiment manifest: everything needed to say exactly what an
 * optimization or evaluation ran on. Deterministic — the same inputs always give
 * the same `manifestHash` (the creation time is excluded from the hash).
 */
import { createHash } from "node:crypto";
import type { Document, EvalQuestion, PlanConfig } from "@/core/domain";
import { ENGINE_VERSION } from "@/core/portable";
import { planKey } from "./labels";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Order-independent hash of the question set: ids, text, evidence and split. */
export function questionSetHash(questions: Pick<EvalQuestion, "id" | "question" | "requiredEvidence" | "split">[]): string {
  return sha256(
    [...questions]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((q) => JSON.stringify([q.id, q.question, q.requiredEvidence, q.split]))
      .join("\n"),
  );
}

/** Hash of a candidate search space, in enumeration order. */
export function searchSpaceHash(space: PlanConfig[]): string {
  return sha256(space.map(planKey).join("\n"));
}

export interface ExperimentManifest {
  schema: "radardb.experiment-manifest";
  schemaVersion: 1;
  engine: { name: "radardb"; version: string };
  dataset: { datasetVersion: string; documents: number; characters: number };
  questions: { total: number; optimization: number; validation: number; hash: string };
  searchSpace: { configurations: number; hash: string };
  router: { version: string; fallbackThreshold: number };
  models: { embedding: string; reranker: string };
  runtime: { node: string; platform: string };
  /** Optional provenance supplied by the caller (e.g. a git commit). */
  source?: { commit?: string };
  createdAt: string;
  /** sha256 over every field above except createdAt. */
  manifestHash: string;
}

export function createExperimentManifest(input: {
  datasetVersion: string;
  documents: Pick<Document, "content">[];
  questions: Pick<EvalQuestion, "id" | "question" | "requiredEvidence" | "split">[];
  space: PlanConfig[];
  router: { version: string; fallbackThreshold: number };
  commit?: string;
  createdAt?: string;
}): ExperimentManifest {
  const body = {
    schema: "radardb.experiment-manifest" as const,
    schemaVersion: 1 as const,
    engine: { name: "radardb" as const, version: ENGINE_VERSION },
    dataset: { datasetVersion: input.datasetVersion, documents: input.documents.length, characters: input.documents.reduce((s, d) => s + d.content.length, 0) },
    questions: {
      total: input.questions.length,
      optimization: input.questions.filter((q) => q.split === "optimization").length,
      validation: input.questions.filter((q) => q.split === "validation").length,
      hash: questionSetHash(input.questions),
    },
    searchSpace: { configurations: input.space.length, hash: searchSpaceHash(input.space) },
    router: input.router,
    models: { embedding: "Xenova/all-MiniLM-L6-v2 (q8)", reranker: "Xenova/ms-marco-MiniLM-L-6-v2 (q8)" },
    runtime: { node: process.version, platform: process.platform },
    ...(input.commit ? { source: { commit: input.commit } } : {}),
  };
  // Runtime is recorded but excluded from the hash so the same experiment hashes identically across machines.
  const { runtime: _runtime, ...hashed } = body;
  void _runtime;
  return { ...body, createdAt: input.createdAt ?? new Date().toISOString(), manifestHash: sha256(JSON.stringify(hashed)) };
}
