import { describe, expect, it } from "vitest";
import type { PlanConfig } from "@/core/domain";
import { dedupeBehaviors, selectGlobal, type UtilityRow } from "@/engine/v11/objective";
import { greedyPortfolio } from "@/engine/v11/portfolio";

// EXPERIMENTAL modules published with FusionContextPlan (objective, portfolio).

const cfg = (over: Partial<PlanConfig> = {}): PlanConfig => ({ chunkingStrategy: "fixed-512", retrievalStrategy: "hybrid", embeddingModel: "minilm-l6", exactMatchBoost: false, graphStrategy: "none", reranker: "none", topK: 8, ...over });
const row = (key: string, u: number[], ndcg = u, tokens = u.map(() => 100), over: Partial<PlanConfig> = {}): UtilityRow => ({ key, config: cfg(over), u, ndcg, tokens });
const all = (n: number) => [...Array(n).keys()];

describe("V1.1 objective", () => {
  it("treats statistically tied configurations as tied and breaks the tie by nDCG@10", () => {
    const n = 60;
    const base = all(n).map((i) => (i % 2 ? 1 : 0));
    const a = row("a", base, base.map(() => 0.4));
    const b = row("b", base.map((v, i) => (i === 0 ? 1 : v)), base.map(() => 0.3)); // one question better on R@5
    const c = row("c", base.map(() => 0), base.map(() => 0.9)); // clearly worse on R@5
    const sel = selectGlobal([a, b, c], all(n), { resamples: 300 });
    expect(sel.nearBest.sort()).toEqual(["a", "b"]);
    expect(sel.key).toBe("a");
  });

  it("collapses identical behaviors to the simplest configuration", () => {
    const u = [1, 0, 1];
    const rows = [row("x|exact", u, u, [1, 1, 1], { exactMatchBoost: true }), row("x", u, u, [1, 1, 1]), row("y", [0, 0, 1])];
    expect(dedupeBehaviors(rows, [0, 1, 2]).map((r) => r.key).sort()).toEqual(["x", "y"]);
  });
});

describe("V1.1 portfolio", () => {
  it("adds complementary plans only while the oracle gain clears the threshold", () => {
    const g = row("g", [1, 1, 0, 0, 1, 1, 0, 0]);
    const comp = row("comp", [0, 0, 1, 1, 0, 0, 1, 1]);
    const tiny = row("tiny", [1, 1, 0, 0, 1, 1, 0, 0.1]);
    const p = greedyPortfolio([g, comp, tiny], all(8), "g", { maxSize: 4, minGain: 0.02 });
    expect(p.keys).toEqual(["g", "comp"]);
    expect(p.oracleTrail[1]).toBe(1);
  });
});
