import type { ContextItem } from "@/core/domain";
import type { RepresentationSet } from "./representations";
import type { Candidate } from "./retrievers";
import { normalize } from "./text";

export interface AssembleOptions {
  maxTokens?: number;
  plan: { id: string; version: number };
}

export interface AssembleResult {
  items: ContextItem[];
  droppedDuplicates: number;
  droppedForBudget: number;
}

/** Text units used for overlap detection: lines, split into sentences, ignoring very short fragments. */
export function units(text: string): string[] {
  return text
    .split("\n")
    .flatMap((l) => l.split(/(?<=[.!?])\s+/))
    .map(normalize)
    .filter((u) => u.length >= 20);
}

/**
 * Turns ranked candidates into the context an LLM receives:
 *  - deduplicates repeated chunks and chunks whose text is ≥80% already included
 *    (overlapping fixed windows, sentence windows);
 *  - enforces the token budget greedily in rank order;
 *  - attaches provenance to every item.
 */
export class ContextAssembler {
  assemble(ranked: Candidate[], reps: RepresentationSet, opts: AssembleOptions): AssembleResult {
    const seenChunks = new Set<number>();
    const seenUnits = new Set<string>();
    const items: ContextItem[] = [];
    let used = 0;
    let droppedDuplicates = 0;
    let droppedForBudget = 0;
    for (const c of ranked) {
      if (seenChunks.has(c.index)) {
        droppedDuplicates++;
        continue;
      }
      const chunk = reps.chunks[c.index];
      const u = units(chunk.content);
      const covered = u.length ? u.filter((x) => seenUnits.has(x)).length / u.length : 0;
      if (covered >= 0.8) {
        droppedDuplicates++;
        continue;
      }
      if (opts.maxTokens != null && used + chunk.tokenCount > opts.maxTokens) {
        droppedForBudget++;
        continue;
      }
      seenChunks.add(c.index);
      u.forEach((x) => seenUnits.add(x));
      used += chunk.tokenCount;
      items.push({
        text: chunk.content,
        tokens: chunk.tokenCount,
        provenance: {
          sourceId: chunk.metadata.sourceId,
          sourceKind: chunk.metadata.sourceKind,
          documentId: chunk.documentId,
          documentTitle: chunk.metadata.title,
          chunkId: chunk.id,
          chunkIndex: chunk.metadata.index,
          method: c.method,
          retrievalScore: Number(c.score.toFixed(4)),
          ...(c.rerankScore != null ? { rerankScore: Number(c.rerankScore.toFixed(4)) } : {}),
          rank: items.length + 1,
          ...(c.graphPath ? { graphPath: c.graphPath } : {}),
          planId: opts.plan.id,
          planVersion: opts.plan.version,
        },
      });
    }
    return { items, droppedDuplicates, droppedForBudget };
  }
}
