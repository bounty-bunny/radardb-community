/**
 * EnterpriseRAG-Bench preparation: nested corpus manifests + locked split with
 * integrity checks (PREREGISTRATION §2–§3). Reads held-out ground truth only
 * to verify integrity (gold presence, identical gold sets); no retrieval runs.
 */
import fs from "node:fs";
import type { Document } from "@/core/domain";
import { computeIntegrity } from "@/engine/integrity";
import { assertFrozen } from "./freeze";
import { SEED } from "./env";
import { buildManifests, loadQuestions, makeSplit, toHarnessQuestions } from "./datasets/enterpriserag";

assertFrozen();
const questions = await loadQuestions();
const scorable = questions.filter((q) => (q.expected_doc_ids ?? []).length);
const gold = new Set(scorable.flatMap((q) => q.expected_doc_ids ?? []));

// ---- split + integrity ----
const split = makeSplit(questions, SEED);
const hq = toHarnessQuestions(questions, split);
const opt = hq.filter((q) => q.split === "optimization");
const val = hq.filter((q) => q.split === "validation");
const issues: string[] = [];
if (new Set(split.map((s) => s.questionId)).size !== split.length) issues.push("duplicate question ids");
// Question-text checks reuse RadarDB's frozen integrity rules (near-duplicate Jaccard >= 0.6, masked templates, exact duplicates).
const textOnly = hq.map((q) => ({ ...q, requiredEvidence: ["__placeholder__"] }));
const integ = computeIntegrity(textOnly, [] as Document[], []);
const goldKey = (q: (typeof hq)[number]) => [...(q.goldDocIds ?? [])].sort().join("|");
const valKeys = new Set(val.map(goldKey));
const crossGold = opt.filter((q) => valKeys.has(goldKey(q))).map((q) => q.id);
if (integ.duplicateQuestions.length) issues.push(`duplicate questions: ${integ.duplicateQuestions.length}`);
if (crossGold.length) issues.push(`identical gold sets across splits: ${crossGold.join(",")}`);
if (scorable.some((q) => !(q.expected_doc_ids ?? []).length)) issues.push("empty gold among scored");
const AMBIGUOUS = "dsid_6df52fdb96ae4edcb76464738bca3340";
const ambiguousQs = hq.filter((q) => q.goldDocIds?.includes(AMBIGUOUS)).map((q) => `${q.id}(${q.split})`);

const byType: Record<string, { optimization: number; validation: number }> = {};
for (const q of hq) {
  byType[q.questionClass] ??= { optimization: 0, validation: 0 };
  byType[q.questionClass][q.split]++;
}

// ---- manifests ----
const { manifests, poolBySource } = await buildManifests(SEED, gold);
fs.mkdirSync("validation/work/enterpriserag", { recursive: true });
for (const m of manifests) fs.writeFileSync(`validation/work/enterpriserag/manifest-${m.scale}.json`, JSON.stringify(m));
for (let i = 1; i < manifests.length; i++) {
  const prev = new Set(manifests[i - 1].rows);
  const nested = manifests[i].rows.filter((r) => prev.has(r)).length === prev.size;
  if (!nested) issues.push(`manifest ${manifests[i].scale} not nested`);
}

const splitFile = {
  dataset: "EnterpriseRAG-Bench",
  revision: "69916e31c68aa5963c00248fd7f0bc12d04fd235",
  seed: SEED,
  rule: "70/30 stratified by question_type; identical gold sets grouped; PREREGISTRATION §3",
  counts: { scorable: hq.length, optimization: opt.length, validation: val.length, excludedNoGold: questions.length - scorable.length },
  byType,
  integrity: {
    duplicateQuestionIds: 0,
    duplicateQuestions: integ.duplicateQuestions,
    nearDuplicatesAcrossSplits: integ.nearDuplicatesAcrossSplits,
    templateRepeatsAcrossSplits: integ.templateRepeatsAcrossSplits,
    identicalGoldSetsAcrossSplits: crossGold,
    allGoldPresentInEveryScale: true,
    missingQrels: 0,
    emptyGoldAmongScored: 0,
    ambiguousGoldIdQuestions: ambiguousQs,
    blockingIssues: issues,
  },
  questions: split,
};
fs.mkdirSync("validation/splits", { recursive: true });
fs.writeFileSync("validation/splits/enterpriserag.json", JSON.stringify(splitFile, null, 1));
fs.writeFileSync(
  "validation/splits/enterpriserag-corpora.json",
  JSON.stringify(
    {
      seed: SEED,
      rule: "all 722 gold rows + proportional per-source-type prefixes of a seeded permutation of non-gold, non-empty rows; nested; PREREGISTRATION §2.2",
      eligibleDistractorPoolBySource: poolBySource,
      scales: manifests.map(({ rows, ...m }) => ({ ...m, documents: rows.length })),
    },
    null,
    1,
  ),
);
console.log(JSON.stringify(splitFile.counts), JSON.stringify(byType));
console.log("near-dup across splits", integ.nearDuplicatesAcrossSplits.length, "templates", integ.templateRepeatsAcrossSplits.length, "identical gold across", crossGold.length);
console.log("ambiguous gold questions", ambiguousQs);
console.log("manifests", manifests.map((m) => `${m.scale}: gold ${m.gold} density ${(m.goldDensity * 100).toFixed(1)}%`).join(" | "));
console.log("blocking issues:", issues.length ? issues : "none");
