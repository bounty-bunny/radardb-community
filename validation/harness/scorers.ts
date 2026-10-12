import type { ContextItem, EvalQuestion } from "@/core/domain";
import { scoreContext } from "@/engine/evaluate";

/** A held question for the harness: RadarDB's EvalQuestion plus optional document-level ground truth. */
export interface HarnessQuestion extends EvalQuestion {
  /** Original benchmark document/passage ids (document-relevance datasets only). */
  goldDocIds?: string[];
  /** Dataset category, for the oracle-routing diagnostic only. */
  category?: string;
}

export interface ScoredOutcome {
  recall: number;
  precision: number;
  success: boolean;
}

export interface Scorer {
  readonly name: "RequiredEvidenceScorer" | "DocumentRelevanceScorer";
  isScorable(q: HarnessQuestion): boolean;
  score(items: ContextItem[], q: HarnessQuestion): ScoredOutcome;
}

/** RadarDB V1 native scoring: the frozen phrase-evidence judge, unchanged. */
export const RequiredEvidenceScorer: Scorer = {
  name: "RequiredEvidenceScorer",
  isScorable: (q) => q.requiredEvidence.length > 0,
  score(items, q) {
    const s = scoreContext(
      items.map((i) => i.text),
      q.requiredEvidence,
    );
    return { recall: s.recall, precision: s.precision, success: s.success };
  },
};

/** Distinct original document ids in rank order (first occurrence). This is the ranking the downstream LLM receives. */
export function rankedDocIds(items: ContextItem[], toOriginal: (radarDocId: string) => string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const id = toOriginal(it.provenance.documentId);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * External benchmark relevance scoring (evaluation adapter, not a V1 capability):
 * evidence coverage / retrieval success / context precision computed from
 * gold document ids instead of evidence phrases.
 */
export function documentRelevanceScorer(toOriginal: (radarDocId: string) => string): Scorer {
  return {
    name: "DocumentRelevanceScorer",
    isScorable: (q) => (q.goldDocIds?.length ?? 0) > 0,
    score(items, q) {
      const gold = new Set(q.goldDocIds ?? []);
      const returned = new Set(items.map((i) => toOriginal(i.provenance.documentId)));
      const found = [...gold].filter((g) => returned.has(g)).length;
      const relevantItems = items.filter((i) => gold.has(toOriginal(i.provenance.documentId))).length;
      return {
        recall: gold.size ? found / gold.size : 0,
        precision: items.length ? relevantItems / items.length : 0,
        success: gold.size > 0 && found === gold.size,
      };
    },
  };
}

/** Rank metrics over the distinct-document ranking (binary relevance, no padding). */
export function rankMetrics(ranking: string[], gold: string[]) {
  const g = new Set(gold);
  const recallAt = (k: number) => ranking.slice(0, k).filter((d) => g.has(d)).length / g.size;
  const ndcgAt = (k: number) => {
    let dcg = 0;
    ranking.slice(0, k).forEach((d, i) => {
      if (g.has(d)) dcg += 1 / Math.log2(i + 2);
    });
    let idcg = 0;
    for (let i = 0; i < Math.min(g.size, k); i++) idcg += 1 / Math.log2(i + 2);
    return idcg ? dcg / idcg : 0;
  };
  const first = ranking.findIndex((d) => g.has(d));
  return {
    recall1: recallAt(1),
    recall3: recallAt(3),
    recall5: recallAt(5),
    recall10: recallAt(10),
    ndcg5: ndcgAt(5),
    ndcg10: ndcgAt(10),
    mrr: first >= 0 ? 1 / (first + 1) : 0,
    success5: [...g].every((d) => ranking.slice(0, 5).includes(d)),
  };
}
