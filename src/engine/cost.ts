import type { PlanConfig } from "@/core/domain";

/**
 * ESTIMATES ONLY. RadarDB does not call an LLM, so cost is modeled:
 * the LLM input cost of the context it returns (what RadarDB controls)
 * plus reranker / query-embedding compute. Edit these to match your stack.
 */
export const COST_MODEL = {
  llmInputPerMTokUsd: 3, // Sonnet-class input pricing
  rerankPer1kPairsUsd: 0.002,
  embedQueryUsd: { "minilm-l6": 0.000002, "hash-ngram": 0 } as Record<string, number>,
};

/** Per-step model inference timings. Measured on this machine at the start of each optimizer run. */
export interface Calibration {
  embedQueryMs: number;
  rerankPerPairMs: number;
  method: string;
}

export const DEFAULT_CALIBRATION: Calibration = {
  embedQueryMs: 15,
  rerankPerPairMs: 3,
  method: "default constants (not measured)",
};

export function estimateCostUsd(config: PlanConfig, contextTokens: number, rerankPairs: number): number {
  let cost = (contextTokens * COST_MODEL.llmInputPerMTokUsd) / 1e6;
  if (config.retrievalStrategy !== "lexical" && config.embeddingModel) cost += COST_MODEL.embedQueryUsd[config.embeddingModel] ?? 0;
  cost += (rerankPairs / 1000) * COST_MODEL.rerankPer1kPairsUsd;
  return cost;
}

/**
 * Estimated retrieval latency: measured in-process time of the non-model
 * steps (index search, graph, assembly) plus calibrated model inference.
 * Used for ranking thousands of trials where caches make wall-clock
 * timings meaningless. Real wall-clock latency is measured separately
 * during validation and on every API request.
 */
export function estimateLatencyMs(config: PlanConfig, nonModelMs: number, rerankPairs: number, cal: Calibration): number {
  let ms = nonModelMs;
  if (config.retrievalStrategy !== "lexical" && config.embeddingModel === "minilm-l6") ms += cal.embedQueryMs;
  ms += rerankPairs * cal.rerankPerPairMs;
  return ms;
}
