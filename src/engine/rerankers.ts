import type { RerankerName } from "@/core/domain";
import type { RepresentationSet } from "./representations";
import type { Candidate } from "./retrievers";
import { rerankScores, type ModelOptions } from "./models";

export interface RerankResult {
  candidates: Candidate[];
  pairs: number;
}

export interface Reranker {
  readonly name: RerankerName;
  /** How many retrieval candidates this reranker wants to see. */
  readonly pool: number;
  rerank(query: string, candidates: Candidate[], reps: RepresentationSet, opts?: ModelOptions): Promise<RerankResult>;
}

export class NoReranker implements Reranker {
  readonly name = "none" as const;
  readonly pool = 0;
  async rerank(_q: string, candidates: Candidate[]): Promise<RerankResult> {
    return { candidates, pairs: 0 };
  }
}

export class CrossEncoderReranker implements Reranker {
  readonly name = "cross-encoder" as const;
  constructor(readonly pool = 20) {}

  async rerank(query: string, candidates: Candidate[], reps: RepresentationSet, opts?: ModelOptions): Promise<RerankResult> {
    const pool = candidates.slice(0, this.pool);
    const scores = await rerankScores(query, pool.map((c) => reps.chunks[c.index].content), opts);
    const reranked = pool.map((c, j) => ({ ...c, rerankScore: scores[j] })).sort((a, b) => b.rerankScore! - a.rerankScore!);
    return { candidates: reranked, pairs: pool.length };
  }
}

export function rerankerFor(name: RerankerName): Reranker {
  return name === "cross-encoder" ? new CrossEncoderReranker() : new NoReranker();
}
