/**
 * WixQA AUDIT + PREFLIGHT (no retrieval, no embedding, no held-out evaluation).
 * Verifies the pinned files, locks the split (primary 400), builds manifests,
 * counts the exact V1 representation workload with the frozen chunkers, and
 * projects runtime from measured calibration runs when available (PRE-RUN PROJECTION;
 * the calibration module is optional and not part of the public benchmark kit).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { constants as bufferConstants } from "node:buffer";
import type { ChunkingStrategy } from "@/core/domain";
import { CHUNKERS } from "@/engine/chunkers";
import { computeIntegrity } from "@/engine/integrity";
import { normalize } from "@/engine/text";
import { demoRouter } from "@/engine/router";
import { assertFrozen } from "./freeze";
import { SEED } from "./env";
import { readJson } from "./datasets/enterpriserag";
import { importOptional } from "./optional";
import { buildManifests, loadArticles, loadPrimaryQuestions, loadQuestions, makeSplit, toDocuments, type WixQuestion } from "./datasets/wixqa";

const frozen = assertFrozen();
const STRATEGIES = Object.keys(CHUNKERS) as ChunkingStrategy[];
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const W = "validation/work/wixqa";
fs.mkdirSync(W, { recursive: true });

// ---------- File pins ----------
const files = ["wix_kb_corpus__wix_kb_corpus.jsonl", "wixqa_expertwritten__test.jsonl", "wixqa_simulated__test.jsonl", "wixqa_synthetic__test.jsonl"].map((f) => {
  const b = fs.readFileSync(`validation/data/wixqa/${f}`);
  return { file: f, bytes: b.length, sha256: sha(b) };
});

// ---------- Corpus audit ----------
const articles = await loadArticles();
const ids = new Set(articles.map((a) => a.id));
const byType: Record<string, number> = {};
for (const a of articles) byType[a.articleType] = (byType[a.articleType] ?? 0) + 1;
const contentHash = new Map<string, number>();
for (const a of articles) contentHash.set(sha(a.contents), (contentHash.get(sha(a.contents)) ?? 0) + 1);
const lens = articles.map((a) => a.contents.length).sort((x, y) => x - y);
const corpus = {
  articles: articles.length,
  duplicateIds: articles.length - ids.size,
  emptyContents: articles.filter((a) => !a.contents.trim()).length,
  duplicateContentsExtraCopies: [...contentHash.values()].reduce((s, n) => s + n - 1, 0),
  characters: lens.reduce((s, n) => s + n, 0),
  charsPerArticle: { mean: Math.round(lens.reduce((s, n) => s + n, 0) / lens.length), median: lens[lens.length >> 1], p95: lens[Math.floor(0.95 * lens.length)], max: lens[lens.length - 1] },
  articleTypes: byType,
};
log("corpus", JSON.stringify(corpus));

// ---------- Question audit ----------
const typeOf = new Map(articles.map((a) => [a.id, a.articleType]));
const subsets: Record<string, unknown> = {};
const audit = (qs: WixQuestion[]) => {
  const golds = qs.map((q) => q.gold.length);
  const texts = new Map<string, number>();
  for (const q of qs) texts.set(normalize(q.question), (texts.get(normalize(q.question)) ?? 0) + 1);
  const qlen = qs.map((q) => q.question.length).sort((a, b) => a - b);
  const goldTypes: Record<string, number> = {};
  for (const q of qs) for (const g of q.gold) goldTypes[typeOf.get(g) ?? "MISSING"] = (goldTypes[typeOf.get(g) ?? "MISSING"] ?? 0) + 1;
  return {
    questions: qs.length,
    emptyGold: qs.filter((q) => !q.gold.length).length,
    goldIdsMissingFromCorpus: qs.flatMap((q) => q.gold).filter((g) => !ids.has(g)).length,
    distinctGoldArticles: new Set(qs.flatMap((q) => q.gold)).size,
    goldPerQuestion: { mean: Number((golds.reduce((a, b) => a + b, 0) / qs.length).toFixed(2)), max: Math.max(...golds), dist: golds.reduce<Record<number, number>>((m, g) => ((m[g] = (m[g] ?? 0) + 1), m), {}) },
    duplicateNormalizedTextExtraCopies: [...texts.values()].reduce((s, n) => s + n - 1, 0),
    questionChars: { median: qlen[qlen.length >> 1], p95: qlen[Math.floor(0.95 * qlen.length)], max: qlen[qlen.length - 1] },
    goldArticleTypes: goldTypes,
    routerClasses: qs.reduce<Record<string, number>>((m, q) => ((m[demoRouter.route(q.question).class] = (m[demoRouter.route(q.question).class] ?? 0) + 1), m), {}),
  };
};
for (const s of ["expertwritten", "simulated", "synthetic"] as const) subsets[s] = audit(await loadQuestions(s));
const primary = await loadPrimaryQuestions();
const ewGold = new Set(primary.filter((q) => q.subset === "expertwritten").flatMap((q) => q.gold));
const simGold = new Set(primary.filter((q) => q.subset === "simulated").flatMap((q) => q.gold));
const crossSubset = {
  sharedGoldArticles: [...ewGold].filter((g) => simGold.has(g)).length,
  identicalTextAcrossSubsets: primary.filter((q) => q.subset === "simulated" && primary.some((p) => p.subset === "expertwritten" && normalize(p.question) === normalize(q.question))).length,
};
const primaryAudit = audit(primary);
log("primary", JSON.stringify(primaryAudit), JSON.stringify(crossSubset));

// ---------- Manifests (2K product-constrained, full) ----------
const gold = new Set(primary.flatMap((q) => q.gold));
const manifests = buildManifests(articles, gold, [2000, articles.length], SEED);
for (const m of manifests) fs.writeFileSync(`${W}/manifest-${m.requested === articles.length ? "full" : m.requested}.json`, JSON.stringify(m));

// ---------- Split (locked here) + integrity ----------
const { records: split, groups, largestGroup } = makeSplit(primary, SEED);
const splitOf = new Map(split.map((s) => [s.questionId, s.split]));
const textOnly = primary.map((q) => ({
  id: q.id,
  question: q.question,
  questionClass: q.subset,
  requiredEvidence: ["__placeholder__"],
  split: splitOf.get(q.id)!,
  provenance: "benchmark" as const,
  humanVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
}));
const integ = computeIntegrity(textOnly, [], []);
const idsIn = (d: string) => [...d.matchAll(/(?:expertwritten|simulated):\d+/g)].map((m) => m[0]);
const crossSplitExact = integ.duplicateQuestions.filter((i) => new Set(idsIn(i.detail).map((x) => splitOf.get(x))).size > 1);
const goldKey = (q: WixQuestion) => [...q.gold].sort().join("|");
const valGold = new Set(primary.filter((q) => splitOf.get(q.id) === "validation").map(goldKey));
const crossGold = primary.filter((q) => splitOf.get(q.id) === "optimization" && valGold.has(goldKey(q))).map((q) => q.id);
const counts = Object.fromEntries(["expertwritten", "simulated"].map((s) => [s, { optimization: split.filter((r) => r.subset === s && r.split === "optimization").length, validation: split.filter((r) => r.subset === s && r.split === "validation").length }]));
const blocking: string[] = [];
if (new Set(split.map((s) => s.questionId)).size !== split.length) blocking.push("duplicate question ids");
if (crossSplitExact.length) blocking.push(`exact duplicates across splits: ${crossSplitExact.length}`);
if (integ.nearDuplicatesAcrossSplits.length) blocking.push(`near-duplicates across splits: ${integ.nearDuplicatesAcrossSplits.length}`);
if (integ.templateRepeatsAcrossSplits.length) blocking.push(`template repeats across splits: ${integ.templateRepeatsAcrossSplits.length}`);
if (crossGold.length) blocking.push(`identical gold sets across splits: ${crossGold.length}`);
if (primary.some((q) => !q.gold.length)) blocking.push("empty gold set");
for (const m of manifests) {
  const present = new Set(m.rows.map((i) => articles[i].id));
  const miss = [...gold].filter((g) => !present.has(g)).length;
  if (miss) blocking.push(`manifest ${m.requested}: ${miss} gold articles missing`);
}
fs.mkdirSync("validation/splits", { recursive: true });
fs.writeFileSync(
  "validation/splits/wixqa.json",
  JSON.stringify(
    {
      dataset: "WixQA (ExpertWritten + Simulated, primary)",
      revision: "d662dc42479c14e202eccd832f8c4b66a035c4cc",
      seed: SEED,
      rule: "70/30 stratified by subset; identical gold sets, identical normalized text and near-duplicates (content-word Jaccard >= 0.6) grouped (union-find); PREREGISTRATION §3/§11",
      questionIds: "<subset>:<0-based line index in wixqa_<subset>__test.jsonl>",
      counts,
      groups,
      largestGroup,
      integrity: {
        withinSplitDuplicates: integ.duplicateQuestions.filter((i) => !crossSplitExact.includes(i)),
        crossSplitExactDuplicates: crossSplitExact,
        nearDuplicatesAcrossSplits: integ.nearDuplicatesAcrossSplits,
        templateRepeatsAcrossSplits: integ.templateRepeatsAcrossSplits,
        identicalGoldSetsAcrossSplits: crossGold,
        blockingIssues: blocking,
      },
      questions: split,
    },
    null,
    1,
  ),
);
log("split", JSON.stringify(counts), "groups", groups, "largest", largestGroup, "blocking", JSON.stringify(blocking));

// ---------- Exact V1 workload (frozen chunkers) ----------
const docs = toDocuments(articles);
const entryChars = `"minilm-l6:${"0".repeat(40)}":"${"A".repeat(4 * Math.ceil((384 * 4) / 3))}"`.length + 1;
const per = docs.map((d) =>
  STRATEGIES.map((s) => {
    const cs = CHUNKERS[s].chunk(d);
    return { n: cs.length, chars: cs.reduce((x, c) => x + c.content.length, 0), hashes: cs.map((c) => createHash("sha1").update(c.content).digest("hex")) };
  }),
);
// Calibration (optional): measured runs giving representation sec per character embedded and search sec per question vs chunks.
const calMod = await importOptional<{ calibrationPoints: () => { domain: string; msPerChar: number; chunks: number; secPerQuestion: number }[]; CALIBRATION_SOURCE: string }>(import.meta.dirname, "wixqa-preflight-calibration.ts");
const cal = calMod ? calMod.calibrationPoints() : [];
const n = cal.length;
const mx = cal.reduce((s, c) => s + c.chunks, 0) / n;
const my = cal.reduce((s, c) => s + c.secPerQuestion, 0) / n;
const slope = cal.reduce((s, c) => s + (c.chunks - mx) * (c.secPerQuestion - my), 0) / cal.reduce((s, c) => s + (c.chunks - mx) ** 2, 0);
const intercept = my - slope * mx;
const msPerChar = { min: Math.min(...cal.map((c) => c.msPerChar)), max: Math.max(...cal.map((c) => c.msPerChar)) };
const nOpt = split.filter((s) => s.split === "optimization").length;
const nSynth = (subsets.synthetic as { questions: number }).questions;
const workload = manifests.map((m) => {
  const chunks: Record<string, number> = {};
  const chars: Record<string, number> = {};
  const uniq = new Set<string>();
  STRATEGIES.forEach((s, k) => {
    chunks[s] = 0;
    chars[s] = 0;
    for (const i of m.rows) {
      chunks[s] += per[i][k].n;
      chars[s] += per[i][k].chars;
      for (const h of per[i][k].hashes) uniq.add(h);
    }
  });
  const totalChunks = Object.values(chunks).reduce((a, b) => a + b, 0);
  const totalChars = Object.values(chars).reduce((a, b) => a + b, 0);
  const cacheJsonChars = 2 + uniq.size * entryChars - 1;
  const sq = intercept + slope * totalChunks;
  return {
    scale: m.requested === articles.length ? "full" : m.requested,
    articles: m.scale,
    goldArticles: m.gold,
    goldDensity: Number(m.goldDensity.toFixed(4)),
    primaryEligible: m.goldDensity <= 0.1,
    chunks,
    totalChunks,
    uniqueVectors: uniq.size,
    charsEmbedded: chars,
    PRE_RUN_PROJECTION: {
      representationSec: [Math.round((totalChars * msPerChar.min) / 1000), Math.round((totalChars * msPerChar.max) / 1000)],
      representationBudgetSec: 7200,
      embeddingCacheJsonChars: cacheJsonChars,
      maxStringLength: bufferConstants.MAX_STRING_LENGTH,
      cacheExceedsMaxStringLength: cacheJsonChars > bufferConstants.MAX_STRING_LENGTH,
      searchSecPrimary: Math.round(nOpt * sq),
      searchSecSyntheticOptimization: Math.round(Math.round(nSynth * 0.7) * sq),
      searchBudgetSec: 21600,
    },
  };
});
log("workload", JSON.stringify(workload.map(({ chunks, charsEmbedded, ...w }) => w)));

const report = {
  label: "WixQA AUDIT + PREFLIGHT — audit/verification measured; workload counts exact (frozen chunkers); runtimes are PRE-RUN PROJECTIONS from measured calibration runs (null when calibration is unavailable)",
  createdAt: new Date().toISOString(),
  frozen,
  machine: { os: `${os.type()} ${os.release()}`, ramTotalGB: Number((os.totalmem() / 2 ** 30).toFixed(1)), ramFreeGB: Number((os.freemem() / 2 ** 30).toFixed(1)) },
  revision: "d662dc42479c14e202eccd832f8c4b66a035c4cc",
  files,
  corpus,
  subsets,
  primary: { ...primaryAudit, crossSubset },
  manifests: manifests.map(({ rows, ...m }) => m),
  split: { counts, optimization: nOpt, validation: split.length - nOpt, groups, largestGroup, blocking, sha256: sha(fs.readFileSync("validation/splits/wixqa.json")) },
  calibration: calMod ? { source: calMod.CALIBRATION_SOURCE, points: cal, representationMsPerChar: msPerChar, searchSecPerQuestion: { intercept, slopePerChunk: slope } } : null,
  workload,
};
fs.writeFileSync("validation/results/wixqa-preflight.json", JSON.stringify(report, null, 2));
log("done");
