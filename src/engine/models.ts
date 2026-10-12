/**
 * Local ML models. Both run on CPU via ONNX (transformers.js) and are
 * downloaded once from the Hugging Face hub on first use.
 *   - all-MiniLM-L6-v2: 384-d sentence embeddings
 *   - ms-marco-MiniLM-L-6-v2: cross-encoder reranker
 * hash-ngram is a dependency-free lexical embedding used as a cheap baseline.
 *
 * `cache: false` bypasses the result caches so latency measurements include
 * real model inference.
 */
import type { EmbeddingModel } from "@/core/domain";
import { DiskCache, b64ToF32, f32ToB64, singleton } from "./cache";
import { sha1, tokenize } from "./text";

/* eslint-disable @typescript-eslint/no-explicit-any */
type FeatureExtractor = (texts: string[], opts: Record<string, unknown>) => Promise<{ tolist(): number[][] }>;
interface CrossEncoder {
  tokenizer: any;
  model: any;
}

const embedCache = singleton("radar.embedCache", () => new DiskCache<Float32Array>("embeddings", f32ToB64, b64ToF32));
const rerankCache = singleton("radar.rerankCache", () => new DiskCache<number>("rerank"));

function loadEmbedder(): Promise<FeatureExtractor> {
  return singleton("radar.embedder", async () => {
    const { pipeline } = await import("@huggingface/transformers");
    return (await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" })) as unknown as FeatureExtractor;
  });
}

function loadCrossEncoder(): Promise<CrossEncoder> {
  return singleton("radar.crossEncoder", async () => {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await import("@huggingface/transformers");
    const id = "Xenova/ms-marco-MiniLM-L-6-v2";
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(id),
      AutoModelForSequenceClassification.from_pretrained(id, { dtype: "q8" }),
    ]);
    return { tokenizer, model };
  });
}

const HASH_DIM = 512;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashEmbed(text: string): Float32Array {
  const v = new Float32Array(HASH_DIM);
  for (const w of tokenize(text)) {
    v[fnv1a("w:" + w) % HASH_DIM] += 2;
    const padded = `#${w}#`;
    for (let i = 0; i + 3 <= padded.length; i++) v[fnv1a(padded.slice(i, i + 3)) % HASH_DIM] += 1;
  }
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export interface ModelOptions {
  cache?: boolean;
}

export async function embed(model: EmbeddingModel, texts: string[], opts: ModelOptions = {}): Promise<Float32Array[]> {
  if (model === "hash-ngram") return texts.map(hashEmbed);
  const useCache = opts.cache !== false;
  const out: (Float32Array | undefined)[] = texts.map((t) => (useCache ? embedCache.get(`${model}:${sha1(t)}`) : undefined));
  const missing = texts.map((t, i) => (out[i] ? -1 : i)).filter((i) => i >= 0);
  if (missing.length) {
    const fe = await loadEmbedder();
    for (let b = 0; b < missing.length; b += 32) {
      const idx = missing.slice(b, b + 32);
      const res = (await fe(idx.map((i) => texts[i]), { pooling: "mean", normalize: true })).tolist();
      idx.forEach((i, j) => {
        const v = Float32Array.from(res[j]);
        out[i] = v;
        if (useCache) embedCache.set(`${model}:${sha1(texts[i])}`, v);
      });
    }
  }
  return out as Float32Array[];
}

/** Cross-encoder relevance scores (logits) for (query, passage) pairs. */
export async function rerankScores(query: string, passages: string[], opts: ModelOptions = {}): Promise<number[]> {
  const useCache = opts.cache !== false;
  const keys = passages.map((p) => sha1(query + "\u0000" + p));
  const out: (number | undefined)[] = keys.map((k) => (useCache ? rerankCache.get(k) : undefined));
  const missing = out.map((v, i) => (v === undefined ? i : -1)).filter((i) => i >= 0);
  if (missing.length) {
    const { tokenizer, model } = await loadCrossEncoder();
    for (let b = 0; b < missing.length; b += 16) {
      const idx = missing.slice(b, b + 16);
      const inputs = tokenizer(
        idx.map(() => query),
        { text_pair: idx.map((i) => passages[i]), padding: true, truncation: true },
      );
      const { logits } = await model(inputs);
      const scores = (logits.tolist() as number[][]).map((r) => r[0]);
      idx.forEach((i, j) => {
        out[i] = scores[j];
        if (useCache) rerankCache.set(keys[i], scores[j]);
      });
    }
  }
  return out as number[];
}

/**
 * Load models AND run a few throwaway inferences, so measurements exclude
 * one-time costs (session creation, kernel selection, allocator warm-up).
 */
export async function warmModels(models: { embed?: boolean; rerank?: boolean }) {
  if (models.embed) {
    await loadEmbedder();
    for (let i = 0; i < 3; i++) await embed("minilm-l6", [`warm-up query ${i}`], { cache: false });
  }
  if (models.rerank) {
    await loadCrossEncoder();
    for (let i = 0; i < 2; i++) await rerankScores(`warm-up ${i}`, ["a short passage", "another short passage"], { cache: false });
  }
}

export function flushModelCaches() {
  embedCache.flush();
  rerankCache.flush();
}
