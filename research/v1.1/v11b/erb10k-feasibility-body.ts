/**
 * EnterpriseRAG 10K RESOURCE-ONLY feasibility for the candidate FusionContextPlan.
 * Builds ONLY the representations that plan requires (not the V1 search space), in a fresh work
 * directory, under the preregistered budgets (PREREGISTRATION §8). Then times the plan on the 328
 * OPTIMIZATION questions to project held-out evaluation time. No retrieval quality is computed;
 * the 142 held-out questions are never loaded.
 */
import fs from "node:fs";
import path from "node:path";
import type { PlanConfig } from "@/core/domain";
import { materialize, datasetVersionOf, type RepresentationSet } from "@/engine/representations";
import { embeddingsFor, executePlan } from "@/engine/executor";
import { flushModelCaches, warmModels } from "@/engine/models";
import { executeFusionPlan, type FusionPlanConfig } from "@/engine/v11/fusion";
import { loadCorpus, readJson, type Manifest } from "../../../validation/harness/datasets/enterpriserag";
import { dirBytes } from "../../../validation/harness/monitor";
import { loadDataset } from "../v11a/data";

const ROOT = process.env.RADAR_ROOT!;
const work = process.cwd();
const BUDGET = { ingestAndRepresentSec: 7200, heldOutEvalSec: 7200, rssMB: 10240, diskMB: 25600 };
const cand = readJson<{ fusionPlan: { key: string; config: FusionPlanConfig }; globalPlan: { key: string; config: PlanConfig }; deployedSystem: string }>(path.join(ROOT, "research/v1.1/v11b/results/candidate-fusionplan-erb-2k.json"));
const plan = cand.fusionPlan.config;
const eventsFile = path.join(work, "events.jsonl");
fs.writeFileSync(eventsFile, "");
const t0 = Date.now();
let stage = "start";
let peakRss = 0;
const facts: Record<string, unknown> = { candidate: cand.fusionPlan.key, deployedSystem: cand.deployedSystem };
const ev = (event: string, data: Record<string, unknown> = {}) => {
  const rss = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rss);
  const row = { t: new Date().toISOString(), elapsedSec: Math.round((Date.now() - t0) / 1000), stage, event, rssMB: Math.round(rss / 1048576), ...data };
  fs.appendFileSync(eventsFile, JSON.stringify(row) + "\n");
  console.log(JSON.stringify(row));
};
const finish = (outcome: "FITS" | "RESOURCE_LIMIT_FAILURE", classification: string | null, error?: unknown) => {
  ev("finish", { outcome, classification });
  fs.writeFileSync(
    path.join(ROOT, "research/v1.1/v11b/results/erb10k-feasibility.json"),
    JSON.stringify({ label: "EnterpriseRAG 10K resource-only feasibility of the candidate FusionContextPlan — optimization questions only; no quality computed; held-out never loaded", outcome, classification, error: error ? String((error as Error).message ?? error) : null, budgets: BUDGET, totalSec: Math.round((Date.now() - t0) / 1000), peakRssSampled500msMB: Math.round(peakRss / 1048576), diskMB: Math.round(dirBytes(work) / 1048576), ...facts }, null, 2),
  );
  process.exit(outcome === "FITS" ? 0 : 3);
};
const watchdog = setInterval(() => {
  const rss = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rss);
  if (rss / 1048576 > BUDGET.rssMB) finish("RESOURCE_LIMIT_FAILURE", "SYSTEM_MEMORY_LIMIT", new Error(`RSS ${Math.round(rss / 1048576)} MB`));
  if ((stage === "ingest" || stage === "represent") && (Date.now() - t0) / 1000 > BUDGET.ingestAndRepresentSec) finish("RESOURCE_LIMIT_FAILURE", "EMBEDDING_TIME_LIMIT", new Error("ingestion + representation exceeded budget"));
}, 500);
watchdog.unref();

try {
  stage = "ingest";
  const manifest = readJson<Manifest>(path.join(ROOT, "validation/work/enterpriserag/manifest-10000.json"));
  const { documents } = await loadCorpus(manifest);
  const version = datasetVersionOf(documents);
  facts.corpus = { documents: documents.length, characters: documents.reduce((s, d) => s + d.content.length, 0), datasetVersion: version, manifestSha256: manifest.sha256, goldDensity: manifest.goldDensity };
  ev("ingested", facts.corpus as Record<string, unknown>);

  stage = "represent";
  const reps = new Map<string, RepresentationSet>();
  const reprs: unknown[] = [];
  facts.representations = reprs;
  for (const c of [plan.primary, plan.partner]) {
    const key = `${c.chunkingStrategy}:${embeddingsFor(c).join("+") || "lexical-only"}`;
    const s = Date.now();
    const rs = await materialize(documents, version, c.chunkingStrategy, embeddingsFor(c));
    reps.set(c === plan.primary ? "primary" : "partner", rs);
    const r = { representation: key, chunks: rs.chunks.length, sec: Math.round((Date.now() - s) / 1000) };
    reprs.push(r);
    ev("representation", r);
  }
  facts.representationSec = Math.round((Date.now() - t0) / 1000);
  flushModelCaches();

  stage = "execute";
  await warmModels({ embed: true, rerank: true });
  const qs = (await loadDataset("erb-2k")).questions; // optimization questions only (scale-independent)
  const g: number[] = [];
  const f: number[] = [];
  for (const q of qs) {
    const s = performance.now();
    await executePlan(plan.primary, q.question, reps.get("primary")!, { plan: { id: "g", version: 1 }, cache: false });
    g.push(performance.now() - s);
    const fr = await executeFusionPlan(plan, q.question, { primary: reps.get("primary")!, partner: reps.get("partner")! }, { plan: { id: "fusion", version: 1 }, cache: false });
    f.push(fr.latency.totalMs);
  }
  const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1) + 0.5)];
  const perQ = (g.reduce((a, b) => a + b, 0) + f.reduce((a, b) => a + b, 0)) / qs.length / 1000;
  facts.execution = {
    optimizationQuestions: qs.length,
    globalMs: { p50: pct(g, 0.5), p95: pct(g, 0.95) },
    fusionMs: { p50: pct(f, 0.5), p95: pct(f, 0.95) },
    PROJECTED_heldOutEvaluationSec: Math.round(perQ * 142 * 2), // quality pass + cold-latency pass, both systems
    heldOutEvalBudgetSec: BUDGET.heldOutEvalSec,
  };
  ev("executed", facts.execution as Record<string, unknown>);
  const fits = (facts.representationSec as number) <= BUDGET.ingestAndRepresentSec && (facts.execution as { PROJECTED_heldOutEvaluationSec: number }).PROJECTED_heldOutEvaluationSec <= BUDGET.heldOutEvalSec && dirBytes(work) / 1048576 <= BUDGET.diskMB;
  finish(fits ? "FITS" : "RESOURCE_LIMIT_FAILURE", fits ? null : "PROJECTED_EVALUATION_TIME_LIMIT");
} catch (e) {
  finish("RESOURCE_LIMIT_FAILURE", /heap|allocation/i.test(String(e)) ? "NODE_HEAP_LIMIT" : "UNKNOWN", e);
}
