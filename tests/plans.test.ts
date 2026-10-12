import { beforeEach, describe, expect, it } from "vitest";
import { ControlPlane } from "@/server/control";
import { Store } from "@/server/store";
import { planKey } from "@/engine/labels";
import { CHEAP_BASELINE, DOCS, QUESTIONS, cheapSpace, tempDir } from "./fixtures";

async function newPlane() {
  const cp = new ControlPlane(new Store(tempDir()));
  cp.state.documents = DOCS.slice();
  cp.state.questions = JSON.parse(JSON.stringify(QUESTIONS));
  cp.store.save();
  return cp;
}

async function runOnce(cp: ControlPlane) {
  const run = cp.startRun({ objective: "balanced", constraints: {}, strategy: "exhaustive", space: cheapSpace(), calibrate: false, baselineConfig: CHEAP_BASELINE });
  await cp.waitForRun();
  expect(run.status).toBe("completed");
  return cp.state.releases.find((r) => r.id === run.candidateReleaseId)!;
}

describe("ContextPlan lifecycle", () => {
  let cp: ControlPlane;
  beforeEach(async () => {
    cp = await newPlane();
  });

  it("an optimizer run creates a validated release with one plan per learned class plus a fallback", async () => {
    const rel = await runOnce(cp);
    expect(rel.version).toBe(1);
    expect(rel.status).toBe("validated");
    expect(rel.validation?.questions).toBe(2);
    const plans = cp.plansOf(rel);
    expect(plans.some((p) => p.questionClass === "*")).toBe(true);
    for (const p of plans) {
      expect(p.status).toBe("validated");
      expect(p.version).toBe(1);
    }
    const run = cp.state.runs[0];
    expect(run.validationSet).toEqual(["v1", "v2"]);
    expect(run.optimizationSet).not.toContain("v1");
  });

  it("deploys explicitly, never automatically", async () => {
    const rel = await runOnce(cp);
    expect(cp.deployedRelease()).toBeUndefined();
    cp.deploy(rel.id);
    expect(cp.deployedRelease()?.id).toBe(rel.id);
    expect(cp.plansOf(rel).every((p) => p.status === "deployed" && p.deployedAt)).toBe(true);
  });

  it("refuses to deploy an unvalidated candidate", async () => {
    const rel = await runOnce(cp);
    (rel as { status: string }).status = "candidate";
    expect(() => cp.deploy(rel.id)).toThrow(/only validated/);
  });

  it("plans are immutable; a new run creates a new version", async () => {
    const v1 = await runOnce(cp);
    cp.deploy(v1.id);
    const p1 = cp.plansOf(v1)[0];
    const before = planKey(p1.config);
    expect(Object.isFrozen(p1.config)).toBe(true);
    expect(() => {
      (p1.config as { topK: number }).topK = 99;
    }).toThrow(TypeError);
    const v2 = await runOnce(cp);
    expect(v2.version).toBe(2);
    expect(v2.id).not.toBe(v1.id);
    expect(cp.plansOf(v2).every((p) => p.version === 2)).toBe(true);
    expect(planKey(cp.plansOf(v1)[0].config)).toBe(before);
    expect(cp.deployedRelease()?.id).toBe(v1.id); // a new run never replaces production
  });

  it("rollback redeploys the previous release", async () => {
    const v1 = await runOnce(cp);
    const v2 = await runOnce(cp);
    cp.deploy(v1.id);
    cp.deploy(v2.id);
    expect(v1.status).toBe("retired");
    const back = cp.rollback();
    expect(back.id).toBe(v1.id);
    expect(v1.status).toBe("deployed");
    expect(v2.status).toBe("retired");
  });

  it("rollback without history is an error", async () => {
    const v1 = await runOnce(cp);
    cp.deploy(v1.id);
    expect(() => cp.rollback()).toThrow(/no previously deployed/);
  });

  it("state survives a reload and interrupted runs are marked failed", async () => {
    const v1 = await runOnce(cp);
    cp.deploy(v1.id);
    cp.state.runs.unshift({ ...cp.state.runs[0], id: "run_stuck", status: "running" });
    cp.store.save();
    const reloaded = new Store(cp.store.dir);
    expect(reloaded.state.releases.find((r) => r.status === "deployed")?.id).toBe(v1.id);
    expect(reloaded.state.runs.find((r) => r.id === "run_stuck")?.status).toBe("failed");
    expect(Object.isFrozen(reloaded.state.plans[0].config)).toBe(true);
  });
});
