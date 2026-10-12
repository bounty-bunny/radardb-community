import { describe, expect, it } from "vitest";
import type { ContextItem, PlanConfig } from "@/core/domain";
import { materialize, datasetVersionOf } from "@/engine/representations";
import { executePlan } from "@/engine/executor";
import { assembleFused, executeFusionPlan, fuseBranches, fusionPlan } from "@/engine/v11/fusion";
import { DOCS } from "./fixtures";

const item = (doc: string, chunk: string, tokens = 10, text = `${doc} ${chunk} unique content sentence long enough to count as a unit.`): ContextItem => ({
  text,
  tokens,
  provenance: { sourceId: "s", sourceKind: "markdown", documentId: doc, documentTitle: doc, chunkId: chunk, chunkIndex: 0, method: "lexical", retrievalScore: 1, rank: 0, planId: "p", planVersion: 1 },
});

describe("FusionContextPlan: fusion and assembly", () => {
  const primary = [item("A", "a1"), item("B", "b1"), item("C", "c1")];
  const partner = [item("B", "b2"), item("D", "d1"), item("A", "a2")];

  it("orders documents by RRF with primary-first tie-breaks and attributes branches", () => {
    const f = fuseBranches(primary, partner);
    // B: 1/62 + 1/61 ; A: 1/61 + 1/63 ; D: 1/62 ; C: 1/63
    expect([...new Set(f.map((c) => c.item.provenance.documentId))]).toEqual(["B", "A", "D", "C"]);
    expect(f[0].fusion).toMatchObject({ branch: "primary", document: "both", primaryDocRank: 2, partnerDocRank: 1 });
    expect(f.find((c) => c.item.provenance.documentId === "D")!.fusion.document).toBe("partner-only");
    expect(f.find((c) => c.item.provenance.documentId === "C")!.fusion.document).toBe("primary-only");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(fuseBranches(primary, partner))).toBe(JSON.stringify(fuseBranches(primary, partner)));
  });

  it("respects the token budget and drops duplicate text", () => {
    const dupText = "Exactly the same sentence appears in both branches of this fusion test.";
    const f = fuseBranches([item("A", "a1", 10, dupText), item("B", "b1", 10)], [item("A", "a2", 10, dupText), item("C", "c1", 10)]);
    const asm = assembleFused(f, 20, { id: "fusion", version: 1 });
    expect(asm.tokens).toBeLessThanOrEqual(20);
    expect(asm.droppedDuplicates).toBe(1);
    expect(asm.items.map((i) => i.provenance.rank)).toEqual([1, 2]);
    expect(asm.items.every((i) => i.provenance.fusion && i.provenance.planId === "fusion")).toBe(true);
  });
});

describe("FusionContextPlan: engine execution", () => {
  it("runs two branches with independent chunkings under the primary's token budget", async () => {
    const version = datasetVersionOf(DOCS);
    const p: PlanConfig = { chunkingStrategy: "section", retrievalStrategy: "lexical", embeddingModel: null, exactMatchBoost: false, graphStrategy: "none", reranker: "none", topK: 3 };
    const q: PlanConfig = { chunkingStrategy: "fixed-256", retrievalStrategy: "vector", embeddingModel: "hash-ngram", exactMatchBoost: false, graphStrategy: "none", reranker: "none", topK: 3 };
    const reps = { primary: await materialize(DOCS, version, "section"), partner: await materialize(DOCS, version, "fixed-256", ["hash-ngram"]) };
    const f = fusionPlan(p, q);
    const a = await executeFusionPlan(f, "who approved DEP-9001", reps, { plan: { id: "fp", version: 1 } });
    const b = await executeFusionPlan(f, "who approved DEP-9001", reps, { plan: { id: "fp", version: 1 } });
    const solo = await executePlan(p, "who approved DEP-9001", reps.primary, { plan: { id: "g", version: 1 } });
    expect(a.budget).toBe(solo.tokens);
    expect(a.tokens).toBeLessThanOrEqual(solo.tokens);
    expect(a.items.length).toBeGreaterThan(0);
    expect(a.items.map((i) => i.provenance.chunkId)).toEqual(b.items.map((i) => i.provenance.chunkId));
    expect(a.latency.totalMs).toBeGreaterThanOrEqual(a.latency.fusionMs);
    expect(new Set(a.items.map((i) => i.provenance.fusion!.branch)).size).toBeGreaterThanOrEqual(1);
  });
});

describe("FusionContextPlan (EXPERIMENTAL): regression guarantees for the stable API", () => {
  const version = datasetVersionOf(DOCS);
  const primary: PlanConfig = { chunkingStrategy: "section", retrievalStrategy: "lexical", embeddingModel: null, exactMatchBoost: true, graphStrategy: "entity-expansion", reranker: "none", topK: 3 };
  const partner: PlanConfig = { chunkingStrategy: "fixed-256", retrievalStrategy: "vector", embeddingModel: "hash-ngram", exactMatchBoost: false, graphStrategy: "none", reranker: "none", topK: 3 };
  const queries = ["who approved DEP-9001", "how do I revert a bad deployment", "what is the Sev1 paging rule", "why were cart totals wrong", "cafeteria menu on Fridays"];

  it("runs the primary branch exactly like a stand-alone executePlan, and stays within its token budget", async () => {
    const reps = { primary: await materialize(DOCS, version, "section"), partner: await materialize(DOCS, version, "fixed-256", ["hash-ngram"]) };
    for (const q of queries) {
      const solo = await executePlan(primary, q, reps.primary, { plan: { id: "g", version: 1 } });
      const fused = await executeFusionPlan(fusionPlan(primary, partner), q, reps, { plan: { id: "fp", version: 1 } });
      expect(fused.primary.items.map((i) => i.provenance.chunkId), q).toEqual(solo.items.map((i) => i.provenance.chunkId));
      expect(fused.budget, q).toBe(solo.tokens);
      expect(fused.tokens, q).toBeLessThanOrEqual(solo.tokens);
      expect(fused.items.every((i) => i.provenance.fusion && i.provenance.planId === "fp"), q).toBe(true);
    }
  });

  it("does not change stable executePlan results for later calls (no shared-state side effects)", async () => {
    const reps = await materialize(DOCS, version, "section");
    const before = await Promise.all(queries.map((q) => executePlan(primary, q, reps, { plan: { id: "g", version: 1 } })));
    const parts = { primary: reps, partner: await materialize(DOCS, version, "fixed-256", ["hash-ngram"]) };
    for (const q of queries) await executeFusionPlan(fusionPlan(primary, partner), q, parts, { plan: { id: "fp", version: 1 } });
    const after = await Promise.all(queries.map((q) => executePlan(primary, q, reps, { plan: { id: "g", version: 1 } })));
    expect(after.map((r) => r.items.map((i) => i.provenance.chunkId))).toEqual(before.map((r) => r.items.map((i) => i.provenance.chunkId)));
  });

  it("is deterministic with the optional shared cross-encoder rerank", async () => {
    const reps = { primary: await materialize(DOCS, version, "section"), partner: await materialize(DOCS, version, "fixed-256", ["hash-ngram"]) };
    const plan = fusionPlan(primary, partner, "cross-encoder");
    const a = await executeFusionPlan(plan, queries[0], reps, { plan: { id: "fp", version: 1 } });
    const b = await executeFusionPlan(plan, queries[0], reps, { plan: { id: "fp", version: 1 } });
    expect(a.items.map((i) => i.provenance.chunkId)).toEqual(b.items.map((i) => i.provenance.chunkId));
    expect(a.rerankPairs).toBeGreaterThan(0);
    expect(a.tokens).toBeLessThanOrEqual(a.budget);
  });
});
