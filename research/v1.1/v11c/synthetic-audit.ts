/**
 * WixQA Synthetic audit + exclusion (no retrieval; no outcomes). Exclusion rules, fixed here:
 *   R1 exact duplicate (normalized text) of ANY primary WixQA question (ExpertWritten + Simulated, all 400:
 *      the 280 development questions and the 120 burned held-out questions);
 *   R2 near-duplicate of any primary question: content-word Jaccard >= 0.6 (RadarDB integrity rule);
 *   R3 exact duplicate within Synthetic: keep the first occurrence (lowest line index), exclude later copies;
 *   R4 empty gold or a gold article missing from the corpus.
 * Reported, not excluded: gold article shared with a primary question (pre-declared diagnostic split).
 *   node node_modules/tsx/dist/cli.mjs --tsconfig research/v1.1/tsconfig.json research/v1.1/v11c/synthetic-audit.ts
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { normalize } from "@/engine/text";
import { loadArticles, loadPrimaryQuestions, loadQuestions } from "../../../validation/harness/datasets/wixqa";

process.env.RADAR_ROOT = process.cwd();
const words = (s: string) => new Set(normalize(s).split(" ").filter((w) => w.length > 3));
const jaccard = (a: Set<string>, b: Set<string>) => {
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  const u = a.size + b.size - i;
  return u ? i / u : 0;
};
const primary = await loadPrimaryQuestions();
const synth = await loadQuestions("synthetic");
const corpus = new Set((await loadArticles()).map((a) => a.id));
const devIds = new Set(JSON.parse(fs.readFileSync("validation/splits/wixqa.json", "utf8")).questions.filter((q: { split: string }) => q.split === "optimization").map((q: { questionId: string }) => q.questionId));
const pNorm = new Map(primary.map((p) => [normalize(p.question), p.id]));
const pWords = primary.map((p) => ({ id: p.id, w: words(p.question) }));
const devGold = new Set(primary.filter((p) => devIds.has(p.id)).flatMap((p) => p.gold));
const allPrimaryGold = new Set(primary.flatMap((p) => p.gold));

const seen = new Map<string, string>();
const excluded: { id: string; rule: string; detail: string }[] = [];
const included: { id: string; sharesGoldWithDevelopment: boolean; sharesGoldWithAnyPrimary: boolean }[] = [];
for (const q of synth) {
  const n = normalize(q.question);
  if (!q.gold.length || q.gold.some((g) => !corpus.has(g))) {
    excluded.push({ id: q.id, rule: "R4", detail: "empty or missing gold" });
    continue;
  }
  if (pNorm.has(n)) {
    excluded.push({ id: q.id, rule: "R1", detail: pNorm.get(n)! });
    continue;
  }
  const w = words(q.question);
  const near = pWords.find((p) => jaccard(w, p.w) >= 0.6);
  if (near) {
    excluded.push({ id: q.id, rule: "R2", detail: near.id });
    continue;
  }
  if (seen.has(n)) {
    excluded.push({ id: q.id, rule: "R3", detail: seen.get(n)! });
    continue;
  }
  seen.set(n, q.id);
  included.push({ id: q.id, sharesGoldWithDevelopment: q.gold.some((g) => devGold.has(g)), sharesGoldWithAnyPrimary: q.gold.some((g) => allPrimaryGold.has(g)) });
}
const count = (r: string) => excluded.filter((e) => e.rule === r).length;
const out = {
  label: "WixQA Synthetic audit — question text and gold-id structure only; no retrieval outcomes",
  createdAt: new Date().toISOString(),
  synthetic: synth.length,
  excluded: { R1_exactDuplicateOfPrimary: count("R1"), R2_nearDuplicateOfPrimary: count("R2"), R3_duplicateWithinSynthetic: count("R3"), R4_badGold: count("R4"), total: excluded.length },
  included: included.length,
  diagnostics: { includedSharingGoldWithDevelopment: included.filter((x) => x.sharesGoldWithDevelopment).length, includedSharingGoldWithAnyPrimary: included.filter((x) => x.sharesGoldWithAnyPrimary).length },
  testIdsSha256: createHash("sha256").update(included.map((x) => x.id).join("\n")).digest("hex"),
  excludedDetail: excluded,
  testQuestions: included,
};
fs.mkdirSync("research/v1.1/v11c/results", { recursive: true });
fs.writeFileSync("research/v1.1/v11c/results/synthetic-audit.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, excludedDetail: out.excludedDetail.slice(0, 8), testQuestions: undefined }, null, 1));
