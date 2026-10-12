import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeIntegrity } from "@/engine/integrity";
import { ControlPlane, seedDemo } from "@/server/control";
import { Store } from "@/server/store";
import { DOCS, QUESTIONS, doc, q, tempDir } from "./fixtures";

describe("evaluation integrity", () => {
  it("passes on the clean fixture", () => {
    const r = computeIntegrity(QUESTIONS, DOCS, []);
    expect(r.passed).toBe(true);
    expect(r.optimizationQuestions).toBe(9);
    expect(r.validationQuestions).toBe(2);
  });

  it("detects evidence leaking into generated distractors", () => {
    const leaky = [...DOCS, doc("gen1", "Distractor", "Noise. The cache key ignored the currency. More noise.", { distractor: true })];
    const r = computeIntegrity(QUESTIONS, leaky, []);
    expect(r.passed).toBe(false);
    expect(r.distractorLeakage.some((i) => i.detail.includes("t7"))).toBe(true);
  });

  it("detects identifier collisions with distractors", () => {
    const r = computeIntegrity(QUESTIONS, [...DOCS, doc("gen2", "Other log", "DEP-9002 was a routine deploy.", { distractor: true })], []);
    expect(r.identifierCollisions.length).toBeGreaterThan(0);
  });

  it("detects duplicate and near-duplicate questions across splits", () => {
    const qs = [
      ...QUESTIONS,
      q("x1", "Who approved deploy DEP-9001?", ["DEP-9001 | cart-svc | Ana Ruiz | Ben Ode"], "validation"),
      q("x2", "Why were the cart totals wrong for shoppers?", ["The cache key ignored the currency"], "validation"),
    ];
    const r = computeIntegrity(qs, DOCS, []);
    expect(r.duplicateQuestions.length).toBe(1);
    expect(r.nearDuplicatesAcrossSplits.some((i) => i.detail.includes("t7") && i.detail.includes("x2"))).toBe(true);
    expect(r.templateRepeatsAcrossSplits.some((i) => i.detail.includes("t2") || i.detail.includes("t1"))).toBe(true);
  });

  it("detects evidence missing from the corpus, evidence in question text, and duplicate documents", () => {
    const qs = [q("m1", "Is the answer 'acknowledge a Sev1 page within 5 minutes'?", ["acknowledge a Sev1 page within 5 minutes"], "optimization"), q("m2", "What is the moon made of?", ["green cheese"], "optimization")];
    const r = computeIntegrity(qs, [...DOCS, { ...DOCS[0], id: "copy" }], []);
    expect(r.evidenceInQuestionText.length).toBeGreaterThan(0);
    expect(r.missingEvidence.some((i) => i.detail.includes("m2"))).toBe(true);
    expect(r.duplicateDocuments.length).toBe(1);
    expect(r.passed).toBe(false);
  });

  it("the bundled demo fixture passes integrity (distractors marked, no leakage)", async () => {
    const cp = new ControlPlane(new Store(tempDir()));
    await seedDemo(cp);
    const r = cp.integrity();
    expect(cp.state.documents.filter((d) => d.metadata.distractor).length).toBe(fs.readdirSync(path.join(process.cwd(), "data/demo/generated")).length);
    expect(r.distractorLeakage).toEqual([]);
    expect(r.identifierCollisions).toEqual([]);
    expect(r.missingEvidence).toEqual([]);
    expect(r.passed).toBe(true);
    expect(cp.state.questions.every((x) => x.provenance === "fixture" && !x.humanVerified)).toBe(true);
  });
});
