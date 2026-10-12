import type { EmbeddingModel, PlanConfig, Provenance } from "@/core/domain";
import type { RepresentationSet } from "./representations";
import { denseSearch, rrf, type Hit } from "./indexes";

export interface PreparedQuery {
  text: string;
  tokens: string[];
  entities: string[];
  vectors: Partial<Record<EmbeddingModel, Float32Array>>;
}

export interface Candidate {
  index: number;
  score: number;
  method: Provenance["method"];
  rerankScore?: number;
  graphPath?: { fromChunkId: string; entity: string }[];
}

export interface Retriever {
  readonly name: string;
  retrieve(q: PreparedQuery, reps: RepresentationSet, n: number): Candidate[];
}

const asCandidates = (hits: Hit[], method: Candidate["method"]): Candidate[] => hits.map((h) => ({ index: h.i, score: h.score, method }));

export class LexicalRetriever implements Retriever {
  readonly name = "lexical";
  retrieve(q: PreparedQuery, reps: RepresentationSet, n: number) {
    return asCandidates(reps.lexical.search(q.tokens, n), "lexical");
  }
}

export class VectorRetriever implements Retriever {
  readonly name: string;
  constructor(private model: EmbeddingModel) {
    this.name = `vector:${model}`;
  }
  retrieve(q: PreparedQuery, reps: RepresentationSet, n: number) {
    const vectors = reps.vectors[this.model];
    const qv = q.vectors[this.model];
    if (!vectors || !qv) throw new Error(`vector representation ${this.model} not materialized`);
    return asCandidates(denseSearch(vectors, qv, n), "vector");
  }
}

/** Reciprocal rank fusion of lexical and vector rankings. */
export class HybridRetriever implements Retriever {
  readonly name: string;
  constructor(
    private lexical: Retriever,
    private vector: Retriever,
    private k = 60,
  ) {
    this.name = `hybrid(${lexical.name},${vector.name})`;
  }
  retrieve(q: PreparedQuery, reps: RepresentationSet, n: number) {
    const pool = Math.max(n, 50);
    const toHits = (c: Candidate[]) => c.map((x) => ({ i: x.index, score: x.score }));
    return asCandidates(rrf([toHits(this.lexical.retrieve(q, reps, pool)), toHits(this.vector.retrieve(q, reps, pool))], n, this.k), "hybrid");
  }
}

/**
 * Decorator: chunks that literally contain a rare identifier from the query
 * (ticket, deploy, PR, commit, version, or an entity in very few chunks) go
 * first. Common entities such as service names are ignored (audit H8).
 */
export class ExactMatchBooster implements Retriever {
  readonly name: string;
  constructor(private inner: Retriever) {
    this.name = `exact-boost(${inner.name})`;
  }
  retrieve(q: PreparedQuery, reps: RepresentationSet, n: number) {
    const ranked = this.inner.retrieve(q, reps, Math.max(n, 50));
    const ids = q.entities.filter((e) => reps.graph.isRare(e));
    if (!ids.length) return ranked.slice(0, n);
    const matches = new Map<number, number>();
    for (const e of ids) for (const i of reps.graph.chunksFor(e)) matches.set(i, (matches.get(i) ?? 0) + 1);
    const rank = new Map(ranked.map((c, r) => [c.index, r]));
    const lexical = new Map(reps.lexical.search(q.tokens, reps.chunks.length).map((h) => [h.i, h.score]));
    const boosted = [...matches.keys()]
      .sort(
        (a, b) =>
          matches.get(b)! - matches.get(a)! ||
          (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) ||
          (lexical.get(b) ?? 0) - (lexical.get(a) ?? 0),
      )
      .slice(0, n);
    const set = new Set(boosted);
    const byIndex = new Map(ranked.map((c) => [c.index, c]));
    return [
      ...boosted.map((i): Candidate => ({ index: i, score: byIndex.get(i)?.score ?? lexical.get(i) ?? 0, method: "exact-match" })),
      ...ranked.filter((c) => !set.has(c.index)),
    ].slice(0, n);
  }
}

/**
 * Secondary retriever: follows rare identifiers from already selected chunks
 * to other chunks that mention them (e.g. incident → deploy row → commit).
 */
export class EntityGraphRetriever {
  readonly name = "entity-graph";

  expand(seeds: Candidate[], reps: RepresentationSet, budget: number, seedCount = 3): Candidate[] {
    const chosen = new Set(seeds.map((s) => s.index));
    const maxFanout = Math.max(3, reps.chunks.length * 0.08);
    const linked = new Map<number, { hits: number; path: { fromChunkId: string; entity: string }[] }>();
    for (const seed of seeds.slice(0, seedCount)) {
      const from = reps.chunks[seed.index];
      for (const e of from.metadata.entities) {
        if (!reps.graph.isRare(e)) continue;
        const targets = reps.graph.chunksFor(e);
        if (targets.length > maxFanout) continue;
        for (const t of targets) {
          if (chosen.has(t)) continue;
          const l = linked.get(t) ?? { hits: 0, path: [] };
          l.hits++;
          if (l.path.length < 3) l.path.push({ fromChunkId: from.id, entity: e });
          linked.set(t, l);
        }
      }
    }
    return [...linked.entries()]
      .sort((a, b) => b[1].hits - a[1].hits || a[0] - b[0])
      .slice(0, budget)
      .map(([index, l]) => ({ index, score: l.hits, method: "graph-expansion" as const, graphPath: l.path }));
  }
}

export function retrieverFor(config: PlanConfig): Retriever {
  const lexical = new LexicalRetriever();
  let r: Retriever;
  if (config.retrievalStrategy === "lexical") r = lexical;
  else {
    const vector = new VectorRetriever(config.embeddingModel ?? "minilm-l6");
    r = config.retrievalStrategy === "vector" ? vector : new HybridRetriever(lexical, vector);
  }
  return config.exactMatchBoost ? new ExactMatchBooster(r) : r;
}
