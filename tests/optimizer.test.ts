import { describe, expect, it } from "vitest";
import type { Metrics, TrialSummary } from "@/core/domain";
import { optimize } from "@/engine/optimizer/runner";
import { ExhaustiveSearch, RandomSearch } from "@/engine/optimizer/strategies";
import { paretoFront, selectConfig } from "@/engine/optimizer/selection";
import { datasetVersionOf } from "@/engine/representations";
import { demoRouter } from "@/engine/router";
import { planKey } from "@/engine/labels";
import { CHEAP_BASELINE, DOCS, QUESTIONS, cheapSpace } from "./fixtures";

const dataset = { version: datasetVersionOf(DOCS), documents: DOCS };
const opt = QUESTIONS.filter((q) => q.split === "optimization");

const run = (questions = opt) =>
  optimize({
    runId: "test",
    dataset,
    questions,
    router: demoRouter,
    strategy: new ExhaustiveSearch(),
    objective: "balanced",
    constraints: {},
    baselineConfig: CHEAP_BASELINE,
    space: cheapSpace(),
    calibrate: false,
  });

const m = (o: Partial<Metrics>): Metrics => ({
  n: 10,
  evidenceCoverage: 0.5,
  retrievalSuccess: 0.5,
  retrievalSuccessCI: [0, 1],
  contextPrecision: 0.5,
  contextTokens: 500,
  estimatedCostUsd: 0.001,
  estimatedLatencyMs: 10,
  ...o,
});
const cfg = cheapSpace()[0];

describe("optimizer", () => {
  it("is deterministic on a fixture", async () => {
    const a = await run();
    const b = await run();
    expect(a.trials.map((t) => [t.key, t.optimization.evidenceCoverage, t.optimization.contextTokens])).toEqual(
      b.trials.map((t) => [t.key, t.optimization.evidenceCoverage, t.optimization.contextTokens]),
    );
    expect(planKey(a.fallback.config)).toBe(planKey(b.fallback.config));
    expect(a.classes.map((c) => planKey(c.config))).toEqual(b.classes.map((c) => planKey(c.config)));
    expect(a.configurationsTested).toBe(cheapSpace().length);
  });

  it("refuses held-out questions (structural isolation)", async () => {
    await expect(run(QUESTIONS)).rejects.toThrow(/non-optimization/);
  });

  it("selection does not change when held-out evidence changes", async () => {
    const before = await run();
    // Mutating held-out questions cannot matter: they are never passed to optimize().
    const mutated = QUESTIONS.map((q) => (q.split === "validation" ? { ...q, requiredEvidence: ["something else entirely"] } : q));
    const after = await run(mutated.filter((q) => q.split === "optimization"));
    expect(planKey(after.fallback.config)).toBe(planKey(before.fallback.config));
  });

  it("learns per-class plans only for classes with enough optimization questions", async () => {
    const out = await run();
    for (const c of out.classes) expect(c.questions).toBeGreaterThanOrEqual(3);
    expect(out.fallback.questionClass).toBe("*");
    expect(out.fallback.explanation.configurationsEvaluated).toBe(cheapSpace().length);
    expect(out.fallback.explanation.alternatives.some((a) => a.selected)).toBe(true);
  });

  it("random search evaluates the requested sample, reproducibly", () => {
    const space = cheapSpace();
    const keys = (s: RandomSearch) => {
      s.init(space);
      const out: string[] = [];
      for (let c = s.next(); c; c = s.next()) out.push(planKey(c));
      return out;
    };
    const a = keys(new RandomSearch(7, 1));
    expect(a).toHaveLength(7);
    expect(keys(new RandomSearch(7, 1))).toEqual(a);
    expect(new Set(a).size).toBe(7);
  });
});

describe("ranking and Pareto", () => {
  it("pareto front drops dominated configurations and keeps real trade-offs", () => {
    const front = paretoFront([
      { key: "A", config: cfg, m: m({ evidenceCoverage: 0.97, contextTokens: 900, estimatedLatencyMs: 40 }) },
      { key: "B", config: cfg, m: m({ evidenceCoverage: 0.96, contextTokens: 420, estimatedLatencyMs: 31 }) },
      { key: "C", config: cfg, m: m({ evidenceCoverage: 0.9, contextTokens: 250, estimatedLatencyMs: 15 }) },
      { key: "D", config: cfg, m: m({ evidenceCoverage: 0.9, contextTokens: 900, estimatedLatencyMs: 40 }) },
    ]);
    expect([...front].sort()).toEqual(["A", "B", "C"]);
  });

  it("objectives rank differently", () => {
    const cands = [
      { key: "quality", config: cfg, m: m({ retrievalSuccess: 1, evidenceCoverage: 1, estimatedCostUsd: 0.005, estimatedLatencyMs: 900 }) },
      { key: "cheap", config: cfg, m: m({ retrievalSuccess: 0.98, evidenceCoverage: 0.99, estimatedCostUsd: 0.001, estimatedLatencyMs: 300 }) },
      { key: "fast", config: cfg, m: m({ retrievalSuccess: 0.98, evidenceCoverage: 0.98, estimatedCostUsd: 0.002, estimatedLatencyMs: 5 }) },
      { key: "bad", config: cfg, m: m({ retrievalSuccess: 0.4, evidenceCoverage: 0.4, estimatedCostUsd: 0.0001, estimatedLatencyMs: 1 }) },
    ];
    const floor = m({ retrievalSuccess: 0.5, evidenceCoverage: 0.5 });
    expect(selectConfig(cands, "quality", {}, floor).winner.key).toBe("quality");
    expect(selectConfig(cands, "balanced", {}, floor).winner.key).toBe("cheap");
    expect(selectConfig(cands, "latency", {}, floor).winner.key).toBe("fast");
    expect(selectConfig(cands, "cost", {}, floor).winner.key).toBe("cheap");
  });

  it("constraints filter candidates and report when nothing satisfies them", () => {
    const cands = [
      { key: "big", config: cfg, m: m({ retrievalSuccess: 1, contextTokens: 2000 }) },
      { key: "small", config: cfg, m: m({ retrievalSuccess: 0.8, contextTokens: 400 }) },
    ];
    const floor = m({});
    const s = selectConfig(cands, "quality", { maxTokens: 500 }, floor);
    expect(s.winner.key).toBe("small");
    expect(s.within).toBe(1);
    expect(selectConfig(cands, "quality", { maxTokens: 10 }, floor).constraintsSatisfiable).toBe(false);
  });

  it("trial summaries mark Pareto membership", async () => {
    const out = await run();
    const pareto = out.trials.filter((t: TrialSummary) => t.pareto);
    expect(pareto.length).toBeGreaterThan(0);
    expect(pareto.length).toBeLessThan(out.trials.length);
  });
});
