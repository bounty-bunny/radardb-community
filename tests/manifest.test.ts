import { describe, expect, it } from "vitest";
import { createExperimentManifest, questionSetHash, searchSpaceHash } from "@/engine/manifest";
import { enumerateSpace } from "@/engine/optimizer/space";

const q = (id: string, split: "optimization" | "validation" = "optimization") => ({ id, question: `question ${id}`, requiredEvidence: [`fact ${id}`], split });
const base = { datasetVersion: "v1", documents: [{ content: "abc" }, { content: "defg" }], space: enumerateSpace(), router: { version: "rules-v1", fallbackThreshold: 0.5 } };

describe("experiment manifest", () => {
  it("is deterministic and independent of question order and creation time", () => {
    const a = createExperimentManifest({ ...base, questions: [q("1"), q("2", "validation")], createdAt: "2026-01-01T00:00:00Z" });
    const b = createExperimentManifest({ ...base, questions: [q("2", "validation"), q("1")], createdAt: "2027-05-05T00:00:00Z" });
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.questions).toMatchObject({ total: 2, optimization: 1, validation: 1 });
    expect(a.dataset).toEqual({ datasetVersion: "v1", documents: 2, characters: 7 });
  });

  it("changes when any input that defines the experiment changes", () => {
    const ref = createExperimentManifest({ ...base, questions: [q("1")] }).manifestHash;
    expect(createExperimentManifest({ ...base, datasetVersion: "v2", questions: [q("1")] }).manifestHash).not.toBe(ref);
    expect(createExperimentManifest({ ...base, questions: [q("1", "validation")] }).manifestHash).not.toBe(ref);
    expect(createExperimentManifest({ ...base, space: enumerateSpace().slice(1), questions: [q("1")] }).manifestHash).not.toBe(ref);
    expect(createExperimentManifest({ ...base, commit: "deadbeef", questions: [q("1")] }).manifestHash).not.toBe(ref);
  });

  it("hashes the frozen 480-configuration search space to the value recorded in the validation lock", () => {
    expect(enumerateSpace()).toHaveLength(480);
    expect(searchSpaceHash(enumerateSpace())).toBe("84281130cfbf0a9f5b935e3279093464353cfc8c9031d5895cda574870f621c3");
    expect(questionSetHash([])).toHaveLength(64);
  });
});
