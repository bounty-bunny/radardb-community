import type { Chunk, ChunkingStrategy, Document, EmbeddingModel, Representation } from "@/core/domain";
import { CHUNKERS } from "./chunkers";
import { BM25 } from "./indexes";
import { embed } from "./models";
import { isLinkingEntity } from "./entities";
import { sha1, tokenize } from "./text";
import { singleton } from "./cache";

/** Entity → chunk index used for exact-identifier boosting and graph expansion. */
export class EntityGraph {
  readonly index = new Map<string, number[]>();

  constructor(private chunks: Chunk[]) {
    chunks.forEach((c, i) => c.metadata.entities.forEach((e) => this.index.set(e, [...(this.index.get(e) ?? []), i])));
  }

  chunksFor(entity: string): number[] {
    return this.index.get(entity) ?? [];
  }

  /** Specific enough to match exactly or to hop on: an ID-shaped entity, or one that occurs in very few chunks. */
  isRare(entity: string): boolean {
    const df = this.chunksFor(entity).length;
    return isLinkingEntity(entity) || (df > 0 && df <= Math.max(3, this.chunks.length * 0.02));
  }

  get edges(): number {
    let n = 0;
    for (const v of this.index.values()) n += v.length;
    return n;
  }
}

/** Every representation of a dataset for one chunking strategy. */
export interface RepresentationSet {
  datasetVersion: string;
  chunking: ChunkingStrategy;
  chunks: Chunk[];
  lexical: BM25;
  vectors: Partial<Record<EmbeddingModel, Float32Array[]>>;
  graph: EntityGraph;
  representations: Representation[];
}

export function datasetVersionOf(documents: Document[]): string {
  return sha1(
    [...documents]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((d) => `${d.id}@${d.checksum}`)
      .join("|"),
  ).slice(0, 12);
}

const sets = singleton("radar.representations", () => new Map<string, RepresentationSet>());

/** Build (or reuse) the representations of a dataset. Cached per dataset version + chunking. */
export async function materialize(
  documents: Document[],
  datasetVersion: string,
  chunking: ChunkingStrategy,
  embeddings: EmbeddingModel[] = [],
): Promise<RepresentationSet> {
  const key = `${datasetVersion}:${chunking}`;
  let rs = sets.get(key);
  const now = () => new Date().toISOString();
  if (!rs) {
    const chunks = documents.flatMap((d) => CHUNKERS[chunking].chunk(d));
    const graph = new EntityGraph(chunks);
    rs = {
      datasetVersion,
      chunking,
      chunks,
      lexical: new BM25(chunks.map((c) => tokenize(c.content))),
      vectors: {},
      graph,
      representations: [
        {
          id: `${key}:chunks`,
          type: "chunk-set",
          configuration: { chunking },
          sourceVersion: datasetVersion,
          generatedAt: now(),
          stats: { chunks: chunks.length, tokens: chunks.reduce((s, c) => s + c.tokenCount, 0) },
        },
        {
          id: `${key}:bm25`,
          type: "lexical-index",
          configuration: { chunking, algorithm: "bm25", k1: 1.2, b: 0.75 },
          sourceVersion: datasetVersion,
          generatedAt: now(),
          stats: { documents: chunks.length },
        },
        {
          id: `${key}:graph`,
          type: "entity-graph",
          configuration: { chunking, extractor: "regex-v1" },
          sourceVersion: datasetVersion,
          generatedAt: now(),
          stats: { entities: graph.index.size, edges: graph.edges },
        },
      ],
    };
    sets.set(key, rs);
  }
  for (const model of embeddings) {
    if (rs.vectors[model]) continue;
    rs.vectors[model] = await embed(model, rs.chunks.map((c) => c.content));
    rs.representations.push({
      id: `${key}:vec:${model}`,
      type: "vector-index",
      configuration: { chunking, model, dimensions: rs.vectors[model]![0]?.length ?? 0 },
      sourceVersion: datasetVersion,
      generatedAt: now(),
      stats: { vectors: rs.chunks.length },
    });
  }
  return rs;
}

/** Drop cached representations for datasets other than the given versions. */
export function evictRepresentations(keep: string[]) {
  for (const key of sets.keys()) if (!keep.some((v) => key.startsWith(v + ":"))) sets.delete(key);
}
