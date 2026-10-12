/**
 * Baseline F — OUTSIDE RADARDB (PREREGISTRATION §6): dense retrieval with a
 * modern embedding model, using RadarDB's frozen chunkers and context
 * assembler so the output shape is identical. Never imported by src/.
 */
import type { Chunk, ChunkingStrategy, ContextItem, Document } from "@/core/domain";
import { CHUNKERS } from "@/engine/chunkers";
import { ContextAssembler } from "@/engine/assembler";
import { denseSearch } from "@/engine/indexes";
import type { RepresentationSet } from "@/engine/representations";

export const F_MODELS = {
  "bge-base": "Xenova/bge-base-en-v1.5",
  "bge-small": "Xenova/bge-small-en-v1.5",
} as const;
export type FModel = keyof typeof F_MODELS;
export const F_DTYPE = "q8";
export const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

type Extractor = (texts: string[], opts: Record<string, unknown>) => Promise<{ tolist(): number[][] }>;
const extractors = new Map<string, Promise<Extractor>>();

export function loadF(model: FModel): Promise<Extractor> {
  const id = F_MODELS[model];
  if (!extractors.has(id))
    extractors.set(
      id,
      (async () => {
        const { pipeline } = await import("@huggingface/transformers");
        return (await pipeline("feature-extraction", id, { dtype: F_DTYPE })) as unknown as Extractor;
      })(),
    );
  return extractors.get(id)!;
}

/** CLS pooling + L2 normalization, as specified for BGE models. */
export async function embedF(model: FModel, texts: string[], batch = 32, onBatch?: (done: number) => void): Promise<Float32Array[]> {
  const fe = await loadF(model);
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += batch) {
    const res = (await fe(texts.slice(i, i + batch), { pooling: "cls", normalize: true })).tolist();
    for (const v of res) out.push(Float32Array.from(v));
    onBatch?.(Math.min(texts.length, i + batch));
  }
  return out;
}

export interface FIndex {
  chunking: ChunkingStrategy;
  chunks: Chunk[];
  vectors: Float32Array[];
}

export function chunkAll(documents: Document[], chunking: ChunkingStrategy): Chunk[] {
  return documents.flatMap((d) => CHUNKERS[chunking].chunk(d));
}

const assembler = new ContextAssembler();

/** Retrieve top-k by cosine (normalized dot product) and assemble with RadarDB's frozen assembler. */
export function retrieveF(index: FIndex, queryVector: Float32Array, topK: number): ContextItem[] {
  const hits = denseSearch(index.vectors, queryVector, topK);
  const reps = { chunks: index.chunks } as unknown as RepresentationSet;
  return assembler.assemble(
    hits.map((h) => ({ index: h.i, score: h.score, method: "vector" as const })),
    reps,
    { plan: { id: "baseline-F", version: 0 } },
  ).items;
}
