import { describe, expect, it } from "vitest";
import { materialize, datasetVersionOf } from "@/engine/representations";
import { executePlan, prepareQuery } from "@/engine/executor";
import { EntityGraphRetriever, ExactMatchBooster, HybridRetriever, LexicalRetriever, VectorRetriever } from "@/engine/retrievers";
import { CrossEncoderReranker } from "@/engine/rerankers";
import { ContextAssembler } from "@/engine/assembler";
import { scoreContext } from "@/engine/evaluate";
import type { PlanConfig } from "@/core/domain";
import { DOCS } from "./fixtures";

const version = datasetVersionOf(DOCS);
const titleOf = (reps: Awaited<ReturnType<typeof materialize>>, i: number) => reps.chunks[i].metadata.title;

describe("retrieval", () => {
  it("exact ID lookup: lexical + exact-ID boost puts the deploy row first", async () => {
    const reps = await materialize(DOCS, version, "section");
    const q = await prepareQuery("Who approved deploy DEP-9002?", []);
    const top = new ExactMatchBooster(new LexicalRetriever()).retrieve(q, reps, 3);
    expect(titleOf(reps, top[0].index)).toBe("Deploy log");
    expect(top[0].method).toBe("exact-match");
    expect(reps.chunks[top[0].index].content).toContain("DEP-9002");
  });

  it("semantic question: MiniLM vector search matches a paraphrase with no shared keywords", async () => {
    const reps = await materialize(DOCS, version, "section", ["minilm-l6"]);
    const q = await prepareQuery("How do I undo a bad release?", ["minilm-l6"]);
    const top = new VectorRetriever("minilm-l6").retrieve(q, reps, 2);
    expect(titleOf(reps, top[0].index)).toBe("Runbook: reverting a release");
  });

  it("hybrid retrieval fuses lexical and vector rankings", async () => {
    const reps = await materialize(DOCS, version, "section", ["hash-ngram"]);
    const q = await prepareQuery("cafeteria pasta Fridays", ["hash-ngram"]);
    const top = new HybridRetriever(new LexicalRetriever(), new VectorRetriever("hash-ngram")).retrieve(q, reps, 3);
    expect(top[0].method).toBe("hybrid");
    expect(titleOf(reps, top[0].index)).toBe("Cafeteria menu");
  });

  it("graph traversal follows a rare identifier from the incident to the deploy log and records the path", async () => {
    const reps = await materialize(DOCS, version, "section");
    const incident = reps.chunks.findIndex((c) => c.content.includes("DEP-9001 shipped"));
    const linked = new EntityGraphRetriever().expand([{ index: incident, score: 1, method: "lexical" }], reps, 3);
    const deployRow = linked.find((c) => reps.chunks[c.index].metadata.title === "Deploy log");
    expect(deployRow).toBeDefined();
    expect(deployRow!.method).toBe("graph-expansion");
    expect(deployRow!.graphPath?.[0].entity).toBe("DEP-9001");
  });

  it("cross-encoder reranking puts the relevant passage above an irrelevant one", async () => {
    const reps = await materialize(DOCS, version, "section");
    const cafeteria = reps.chunks.findIndex((c) => c.metadata.title === "Cafeteria menu");
    const runbook = reps.chunks.findIndex((c) => c.content.includes("deployctl rollback"));
    const res = await new CrossEncoderReranker().rerank(
      "how do I roll back a deployment",
      [
        { index: cafeteria, score: 1, method: "lexical" },
        { index: runbook, score: 0.5, method: "lexical" },
      ],
      reps,
    );
    expect(res.candidates[0].index).toBe(runbook);
    expect(res.candidates[0].rerankScore).toBeGreaterThan(res.candidates[1].rerankScore!);
    expect(res.pairs).toBe(2);
  });

  it("assembler removes duplicate text and enforces the token budget", async () => {
    const reps = await materialize(DOCS, version, "section");
    const i = reps.chunks.findIndex((c) => c.metadata.title === "Cafeteria menu");
    const j = reps.chunks.findIndex((c) => c.metadata.title === "On-call policy");
    const a = new ContextAssembler();
    const dup = a.assemble(
      [
        { index: i, score: 2, method: "lexical" },
        { index: i, score: 1, method: "vector" },
      ],
      reps,
      { plan: { id: "p", version: 1 } },
    );
    expect(dup.items).toHaveLength(1);
    expect(dup.droppedDuplicates).toBe(1);
    const budget = a.assemble(
      [
        { index: i, score: 2, method: "lexical" },
        { index: j, score: 1, method: "lexical" },
      ],
      reps,
      { plan: { id: "p", version: 1 }, maxTokens: reps.chunks[i].tokenCount },
    );
    expect(budget.items.map((x) => x.provenance.chunkId)).toEqual([reps.chunks[i].id]);
    expect(budget.droppedForBudget).toBe(1);
  });

  it("executePlan returns provenance for every item and a step trace", async () => {
    const cfg: PlanConfig = {
      chunkingStrategy: "section",
      retrievalStrategy: "lexical",
      embeddingModel: null,
      exactMatchBoost: true,
      graphStrategy: "entity-expansion",
      reranker: "none",
      topK: 2,
    };
    const reps = await materialize(DOCS, version, "section");
    const r = await executePlan(cfg, "Which deploy broke the cart cache in INC-9001?", reps, { plan: { id: "plan_x", version: 7 } });
    expect(r.items.length).toBeGreaterThan(0);
    for (const it of r.items) {
      expect(it.provenance.planId).toBe("plan_x");
      expect(it.provenance.planVersion).toBe(7);
      expect(it.provenance.documentId).toBeTruthy();
    }
    expect(r.trace.map((t) => t.step)).toEqual(expect.arrayContaining(["plan", "embed query", "retrieve", "graph expansion", "assemble"]));
    expect(scoreContext(r.items.map((x) => x.text), ["DEP-9001 shipped a cache bug"]).success).toBe(true);
  });

  it("scoring counts evidence only when one item contains it (no stitching across chunks)", () => {
    const s = scoreContext(["the outage was", "external (Stripe)"], ["The outage was external (Stripe)"]);
    expect(s.success).toBe(false);
    const ok = scoreContext(["The outage was external (Stripe).", "noise"], ["The outage was external (Stripe)"]);
    expect(ok.success).toBe(true);
    expect(ok.precision).toBe(0.5);
  });
});
