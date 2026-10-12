import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalize } from "@/engine/text";

const DIR = path.join(process.cwd(), "examples/quickstart");
const questions = JSON.parse(fs.readFileSync(path.join(DIR, "questions.json"), "utf8")) as {
  question: string;
  requiredEvidence: (string | string[])[];
  split: "optimization" | "validation";
}[];
const corpus = fs
  .readdirSync(path.join(DIR, "docs"))
  .map((f) => normalize(fs.readFileSync(path.join(DIR, "docs", f), "utf8")))
  .join(" | ");

describe("quick-start example dataset", () => {
  it("has the documented fixed split (13 optimization / 7 validation) and no duplicate questions", () => {
    expect(questions.filter((q) => q.split === "optimization")).toHaveLength(13);
    expect(questions.filter((q) => q.split === "validation")).toHaveLength(7);
    expect(new Set(questions.map((q) => normalize(q.question))).size).toBe(questions.length);
  });

  it("every required-evidence phrase appears in the documents (with the product's normalization)", () => {
    for (const q of questions) {
      expect(q.requiredEvidence.length, q.question).toBeGreaterThan(0);
      for (const e of q.requiredEvidence) {
        const alts = (Array.isArray(e) ? e : [e]).map(normalize);
        expect(alts.some((a) => corpus.includes(a)), `${q.question} → ${JSON.stringify(e)}`).toBe(true);
      }
    }
  });
});
