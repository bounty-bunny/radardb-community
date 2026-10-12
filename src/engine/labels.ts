/** Display labels and config helpers. Pure: safe to import from client components. */
import type { ChunkingStrategy, EmbeddingModel, PlanConfig, RerankerName, RetrievalStrategy } from "@/core/domain";

export const CHUNKING_LABEL: Record<ChunkingStrategy, string> = {
  "fixed-512": "Fixed 512 tok",
  "fixed-256": "Fixed 256 tok",
  section: "Section-aware",
  "sentence-window": "Sentence window",
};

export const RETRIEVAL_LABEL: Record<RetrievalStrategy, string> = {
  lexical: "Lexical (BM25)",
  vector: "Vector",
  hybrid: "Hybrid (BM25 + vector)",
};

export const EMBEDDING_LABEL: Record<EmbeddingModel, string> = {
  "minilm-l6": "MiniLM-L6",
  "hash-ngram": "Hashed n-gram",
};

export const RERANKER_LABEL: Record<RerankerName, string> = { none: "No reranker", "cross-encoder": "Cross-encoder" };

export function planKey(c: PlanConfig): string {
  return [
    c.chunkingStrategy,
    c.retrievalStrategy,
    c.embeddingModel ?? "-",
    c.exactMatchBoost ? "exact" : "-",
    c.graphStrategy === "entity-expansion" ? "graph" : "-",
    c.reranker,
    `k${c.topK}`,
  ].join("|");
}

/** Retrieval family used to group competing configurations in explanations. */
export function familyOf(c: PlanConfig): string {
  const base = c.retrievalStrategy === "lexical" ? "Lexical" : c.retrievalStrategy === "vector" ? "Vector" : "Hybrid";
  return c.graphStrategy === "entity-expansion" ? `${base} + entity graph` : `${base} only`;
}

export function describePlan(c: PlanConfig): string[] {
  const parts = [CHUNKING_LABEL[c.chunkingStrategy], RETRIEVAL_LABEL[c.retrievalStrategy]];
  if (c.embeddingModel && c.retrievalStrategy !== "lexical") parts.push(EMBEDDING_LABEL[c.embeddingModel]);
  if (c.exactMatchBoost) parts.push("Exact-ID boost");
  if (c.graphStrategy === "entity-expansion") parts.push("Entity graph");
  if (c.reranker !== "none") parts.push(RERANKER_LABEL[c.reranker]);
  parts.push(`top-${c.topK}`);
  return parts;
}

export function shortPlan(c: PlanConfig): string {
  const core = c.retrievalStrategy === "lexical" ? "Lexical" : c.retrievalStrategy === "vector" ? "Vector" : "Hybrid";
  const extras = [c.exactMatchBoost && "exact-ID", c.graphStrategy !== "none" && "graph", c.reranker !== "none" && "rerank"].filter(Boolean);
  return `${core}${extras.length ? " + " + extras.join(" + ") : ""} · top-${c.topK}`;
}
