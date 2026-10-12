import { describe, expect, it } from "vitest";
import type { ContextPlan, Metrics, PlanConfig, PlanRelease } from "@/core/domain";
import { FusionPlanConfigSchema, PlanConfigSchema, PLAN_RELEASE_SCHEMA } from "@/core/schemas";
import { parsePortableRelease, toPortableRelease } from "@/core/portable";
import { fusionPlan } from "@/engine/v11/fusion";
import { BASELINE_CONFIG, enumerateSpace } from "@/engine/optimizer/space";

const metrics: Metrics = { n: 10, evidenceCoverage: 0.8, retrievalSuccess: 0.7, retrievalSuccessCI: [0.4, 0.9], contextPrecision: 0.5, contextTokens: 900, estimatedCostUsd: 0.001, estimatedLatencyMs: 40 };
const plan = (questionClass: string, config: PlanConfig): ContextPlan =>
  ({ id: `plan_${questionClass}`, version: 3, questionClass, config, filters: {}, metrics, validationMetrics: null, confidence: { level: "medium", reason: "test" }, status: "deployed", runId: "run_1", explanation: {}, createdAt: "2026-01-01T00:00:00.000Z" }) as unknown as ContextPlan;
const release: PlanRelease = { id: "rel_3", version: 3, runId: "run_1", datasetVersion: "abc123", routerVersion: "rules-v1", planIds: { lookup: "plan_lookup" }, fallbackPlanId: "plan_*", status: "deployed", createdAt: "2026-01-01T00:00:00.000Z" } as unknown as PlanRelease;
const lookup: PlanConfig = { ...BASELINE_CONFIG, retrievalStrategy: "lexical", embeddingModel: null };

describe("versioned config schemas", () => {
  it("accept every configuration in the frozen search space", () => {
    for (const c of enumerateSpace()) expect(PlanConfigSchema.safeParse(c).success, JSON.stringify(c)).toBe(true);
  });

  it("reject invalid configurations", () => {
    expect(PlanConfigSchema.safeParse({ ...BASELINE_CONFIG, topK: 0 }).success).toBe(false);
    expect(PlanConfigSchema.safeParse({ ...BASELINE_CONFIG, retrievalStrategy: "vector", embeddingModel: null }).success).toBe(false);
    expect(PlanConfigSchema.safeParse({ ...BASELINE_CONFIG, chunkingStrategy: "pages" }).success).toBe(false);
    expect(PlanConfigSchema.safeParse({ ...BASELINE_CONFIG, extra: 1 }).success).toBe(false);
  });

  it("accept the engine's FusionContextPlan configuration", () => {
    expect(FusionPlanConfigSchema.safeParse(fusionPlan(BASELINE_CONFIG, lookup)).success).toBe(true);
  });
});

describe("portable plan releases", () => {
  const exported = toPortableRelease(release, [plan("*", BASELINE_CONFIG), plan("lookup", lookup)], "2026-02-02T00:00:00.000Z");

  it("export a validated, versioned document with the fallback last", () => {
    expect(exported.schema).toBe(PLAN_RELEASE_SCHEMA);
    expect(exported.schemaVersion).toBe(1);
    expect(exported.plans.map((p) => p.questionClass)).toEqual(["lookup", "*"]);
  });

  it("round-trip through JSON unchanged", () => {
    const r = parsePortableRelease(JSON.parse(JSON.stringify(exported)));
    expect(r).toEqual({ ok: true, release: exported, migratedFrom: null });
  });

  it("migrate the legacy GET /api/plans shape", () => {
    const r = parsePortableRelease({ release, plans: [plan("*", BASELINE_CONFIG)] }, () => "2026-03-03T00:00:00.000Z");
    expect(r.ok && r.migratedFrom).toBe("legacy /api/plans release view");
  });

  it("reject unknown versions, missing fallbacks and foreign documents with readable errors", () => {
    const future = parsePortableRelease({ ...exported, schemaVersion: 2 });
    expect(future.ok).toBe(false);
    expect(!future.ok && future.errors[0]).toMatch(/unsupported version 2/);
    const noFallback = parsePortableRelease({ ...exported, plans: exported.plans.filter((p) => p.questionClass !== "*") });
    expect(!noFallback.ok && noFallback.errors.join(" ")).toMatch(/fallback/);
    expect(parsePortableRelease({ hello: "world" }).ok).toBe(false);
    const badConfig = parsePortableRelease({ ...exported, plans: [{ ...exported.plans[1], config: { ...BASELINE_CONFIG, topK: -1 } }] });
    expect(!badConfig.ok && badConfig.errors.join(" ")).toMatch(/topK/);
  });
});
