import type { ChunkingStrategy, EmbeddingModel, PlanConfig, RerankerName } from "@/core/domain";

export const SEARCH_SPACE = {
  chunkingStrategy: ["fixed-512", "fixed-256", "section", "sentence-window"] as ChunkingStrategy[],
  retrieval: [
    { retrievalStrategy: "lexical", embeddingModel: null },
    { retrievalStrategy: "vector", embeddingModel: "minilm-l6" },
    { retrievalStrategy: "vector", embeddingModel: "hash-ngram" },
    { retrievalStrategy: "hybrid", embeddingModel: "minilm-l6" },
    { retrievalStrategy: "hybrid", embeddingModel: "hash-ngram" },
  ] as Pick<PlanConfig, "retrievalStrategy" | "embeddingModel">[],
  exactMatchBoost: [false, true],
  graphStrategy: ["none", "entity-expansion"] as PlanConfig["graphStrategy"][],
  reranker: ["none", "cross-encoder"] as RerankerName[],
  topK: [3, 5, 8],
};

/** "Typical RAG": fixed 512-token chunks, MiniLM vector search, top-5, nothing else. */
export const BASELINE_CONFIG: PlanConfig = {
  chunkingStrategy: "fixed-512",
  retrievalStrategy: "vector",
  embeddingModel: "minilm-l6",
  exactMatchBoost: false,
  graphStrategy: "none",
  reranker: "none",
  topK: 5,
};

export function enumerateSpace(): PlanConfig[] {
  const s = SEARCH_SPACE;
  const out: PlanConfig[] = [];
  for (const chunkingStrategy of s.chunkingStrategy)
    for (const r of s.retrieval)
      for (const exactMatchBoost of s.exactMatchBoost)
        for (const graphStrategy of s.graphStrategy)
          for (const reranker of s.reranker)
            for (const topK of s.topK) out.push({ chunkingStrategy, ...r, exactMatchBoost, graphStrategy, reranker, topK });
  return out;
}

export function embeddingModelsIn(configs: PlanConfig[]): EmbeddingModel[] {
  return [...new Set(configs.filter((c) => c.retrievalStrategy !== "lexical" && c.embeddingModel).map((c) => c.embeddingModel!))];
}
