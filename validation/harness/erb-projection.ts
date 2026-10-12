/**
 * PRE-RUN PROJECTION for the 10K EnterpriseRAG feasibility stage.
 * Read-only: uses 2K measurements, the 10K manifest's documents (no labels),
 * and the frozen chunkers to count chunks exactly. No embedding, no search.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { constants as bufferConstants } from "node:buffer";
import { execFileSync } from "node:child_process";
import { CHUNKERS } from "@/engine/chunkers";
import type { ChunkingStrategy } from "@/core/domain";
import { assertFrozen } from "./freeze";
import { loadCorpus, readJson, type Manifest } from "./datasets/enterpriserag";

assertFrozen();
const compat = readJson<{
  corpus: { characters: number };
  representations: { chunks: Record<ChunkingStrategy, number>; buildSec: number };
  optimizer: { searchSec: number };
  resources: { peakRssMB: number };
}>("validation/results/enterpriserag-compat-2000.json");
const cacheFile = "validation/work/enterpriserag/scale-2000/.radar/cache/embeddings.json";
const cacheBytes2k = fs.statSync(cacheFile).size;

// Exact chunk counts and unique-text (cache entry) counts with the frozen chunkers.
async function count(scale: number) {
  const { documents } = await loadCorpus(readJson<Manifest>(`validation/work/enterpriserag/manifest-${scale}.json`));
  const chars = documents.reduce((s, d) => s + d.content.length, 0);
  const chunks: Record<string, number> = {};
  const unique = new Set<string>();
  for (const s of Object.keys(CHUNKERS) as ChunkingStrategy[]) {
    let n = 0;
    for (const d of documents)
      for (const c of CHUNKERS[s].chunk(d)) {
        n++;
        unique.add(createHash("sha1").update(c.content).digest("hex"));
      }
    chunks[s] = n;
  }
  return { documents: documents.length, chars, chunks, totalChunks: Object.values(chunks).reduce((a, b) => a + b, 0), uniqueVectors: unique.size };
}
const c2 = await count(2000);
const c10 = await count(10000);

// JSON length of V1's embedding cache: {"minilm-l6:<sha1>":"<base64 of 384 float32>",...}
const entryChars = `"minilm-l6:${"0".repeat(40)}":"${"A".repeat(4 * Math.ceil((384 * 4) / 3))}"`.length + 1;
const projectedJson10k = 2 + c10.uniqueVectors * entryChars - 1;
const check2k = 2 + c2.uniqueVectors * entryChars - 1;

// Search-time split from 2K experiments (optimization questions only): reranked vs not.
let rerankMs = 0;
let otherMs = 0;
for (const line of fs.readFileSync("validation/work/enterpriserag/scale-2000/experiments.jsonl", "utf8").split("\n")) {
  if (!line) continue;
  const r = JSON.parse(line) as { configKey: string; measuredLatencyMs: number };
  if (r.configKey.includes("cross-encoder")) rerankMs += r.measuredLatencyMs;
  else otherMs += r.measuredLatencyMs;
}
const ratio = c10.totalChunks / c2.totalChunks;
const vecRatio = c10.uniqueVectors / c2.uniqueVectors;
let diskFreeGB = NaN;
try {
  const out = execFileSync("powershell", ["-NoProfile", "-Command", "(Get-PSDrive C).Free"], { encoding: "utf8" });
  diskFreeGB = Number(out.trim()) / 2 ** 30;
} catch {}

const projection = {
  label: "PRE-RUN PROJECTION — prediction only, not a measured result",
  createdAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    nodeFlags: "--max-old-space-size=8192 (preregistered)",
    maxStringLength: bufferConstants.MAX_STRING_LENGTH,
    heapLimitMB: Math.round((await import("node:v8")).getHeapStatistics().heap_size_limit / 1048576),
    ramTotalGB: Number((os.totalmem() / 2 ** 30).toFixed(1)),
    ramFreeGB: Number((os.freemem() / 2 ** 30).toFixed(1)),
    diskFreeGB: Number(diskFreeGB.toFixed(1)),
  },
  measured2k: {
    corpusChars: compat.corpus.characters,
    chunks: compat.representations.chunks,
    cachedVectorsUnique: c2.uniqueVectors,
    embeddingCacheBytes: cacheBytes2k,
    embeddingCacheJsonCharsFormula: check2k,
    representationBuildSec: compat.representations.buildSec,
    searchSec: compat.optimizer.searchSec,
    searchSplitFromExperimentsSec: { reranked: Math.round(rerankMs / 1000), notReranked: Math.round(otherMs / 1000) },
    peakRssMB: compat.resources.peakRssMB,
  },
  computed10k: {
    note: "exact, deterministic: frozen chunkers applied to the 10K manifest documents (no embedding)",
    documents: c10.documents,
    corpusChars: c10.chars,
    chunks: c10.chunks,
    totalChunks: c10.totalChunks,
    cachedVectorsUnique: c10.uniqueVectors,
  },
  projected10k: {
    embeddingCacheJsonChars: projectedJson10k,
    exceedsMaxStringLength: projectedJson10k > bufferConstants.MAX_STRING_LENGTH,
    overBy: projectedJson10k - bufferConstants.MAX_STRING_LENGTH,
    representationBuildSec: Math.round(compat.representations.buildSec * vecRatio),
    representationBudgetSec: 7200,
    searchSec: Math.round(compat.optimizer.searchSec * ((otherMs * ratio + rerankMs) / (otherMs + rerankMs))),
    searchBudgetSec: 21600,
    peakRssMB: Math.round(compat.resources.peakRssMB * ratio),
    rssBudgetMB: 10240,
    assumptions: [
      "representation time scales with unique vectors embedded (MiniLM dominates)",
      "non-reranked retrieval time scales with total chunks (linear BM25/vector scans); reranker time per query is constant (20 pairs)",
      "RSS scales with total chunks (upper-bound style estimate)",
      "V1 serializes the embedding cache once, at the end of the search (flushModelCaches)",
    ],
  },
};
fs.writeFileSync("validation/results/enterpriserag-10k-projection.json", JSON.stringify(projection, null, 2));
console.log(JSON.stringify(projection, null, 2));
