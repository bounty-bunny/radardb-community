import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Benchmark, BenchmarkReport, Document, EvalQuestion, Evidence, Objective, Source } from "@/core/domain";
import { optimize } from "@/engine/optimizer/runner";
import { validatePlans } from "@/engine/optimizer/validate";
import { strategyFor } from "@/engine/optimizer/strategies";
import { BASELINE_CONFIG, enumerateSpace } from "@/engine/optimizer/space";
import { computeIntegrity } from "@/engine/integrity";
import { datasetVersionOf } from "@/engine/representations";
import { classLabel } from "@/engine/router";
import { sha1 } from "@/engine/text";
import { assignSplit, ControlError, type ControlPlane } from "./control";

export interface BenchmarkInput {
  name: string;
  objective?: Objective;
  documents: { title: string; content: string; path?: string }[];
  questions: { question: string; requiredEvidence?: Evidence[]; questionClass?: string; split?: "optimization" | "validation" }[];
}

export const BENCHMARK_LIMITS = { documents: 2000, totalChars: 20_000_000, questions: 500 };

/**
 * Context Benchmark: a design partner's documents + questions → baseline vs
 * RadarDB report, in an isolated dataset. Nothing is deployed and the
 * workspace's own sources, eval set and plans are untouched.
 */
export function startBenchmark(cp: ControlPlane, input: BenchmarkInput): Benchmark {
  if (cp.state.benchmarks.some((b) => b.status === "running") || cp.activeRun())
    throw new ControlError("busy", "another optimization or benchmark is running", 409);
  if (!input.documents.length) throw new ControlError("invalid", "at least one document is required");
  const totalChars = input.documents.reduce((s, d) => s + d.content.length, 0);
  if (input.documents.length > BENCHMARK_LIMITS.documents || totalChars > BENCHMARK_LIMITS.totalChars || input.questions.length > BENCHMARK_LIMITS.questions)
    throw new ControlError("too_large", `limits: ${BENCHMARK_LIMITS.documents} documents, ${BENCHMARK_LIMITS.totalChars} characters, ${BENCHMARK_LIMITS.questions} questions`);

  const id = `bench_${Date.now().toString(36)}`;
  const bench: Benchmark = {
    id,
    name: input.name.trim().slice(0, 120) || "Untitled benchmark",
    createdAt: new Date().toISOString(),
    status: "running",
    progress: { stage: "Queued", done: 0, total: 1 },
  };
  cp.state.benchmarks.unshift(bench);
  cp.store.save();

  // Persist the input so the benchmark can be re-run or audited.
  const dir = cp.store.benchmarkDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "input.json"), JSON.stringify(input));

  run(cp, bench, input)
    .then((report) => {
      bench.report = report;
      bench.status = "completed";
    })
    .catch((e: unknown) => {
      bench.status = "failed";
      bench.error = e instanceof Error ? e.message : String(e);
    })
    .finally(() => {
      bench.completedAt = new Date().toISOString();
      cp.store.save();
    });
  return bench;
}

async function run(cp: ControlPlane, bench: Benchmark, input: BenchmarkInput): Promise<BenchmarkReport> {
  const created = new Date().toISOString();
  const source: Source = {
    id: `${bench.id}_src`,
    type: "upload",
    name: bench.name,
    kind: "markdown",
    connection: {},
    syncStatus: "synced",
    documentCount: input.documents.length,
    synthetic: false,
    permissions: { model: "none", note: "benchmark input" },
    createdAt: created,
  };
  const documents: Document[] = input.documents.map((d, i) => {
    const content = d.content.replace(/\r\n/g, "\n").trim();
    return {
      id: `${bench.id}:${i}`,
      sourceId: source.id,
      externalId: d.path ?? `doc-${i}`,
      content,
      metadata: { title: d.title.slice(0, 200) || `Document ${i + 1}`, kind: "markdown" },
      createdAt: created,
      updatedAt: created,
      version: 1,
      checksum: sha1(content),
    };
  });
  const router = cp.router;
  const questions: EvalQuestion[] = input.questions.map((q, i) => {
    const id = `b${String(i + 1).padStart(3, "0")}`;
    return {
      id,
      question: q.question,
      questionClass: q.questionClass ?? router.route(q.question).class,
      requiredEvidence: q.requiredEvidence ?? [],
      split: q.split ?? assignSplit(`${bench.id}:${id}`),
      provenance: "benchmark",
      humanVerified: true,
      createdAt: created,
    };
  });
  const scorable = questions.filter((q) => q.requiredEvidence.length);
  const opt = scorable.filter((q) => q.split === "optimization");
  const val = scorable.filter((q) => q.split === "validation");
  if (opt.length < 3) throw new Error(`need at least 3 optimization questions with required evidence (have ${opt.length})`);
  const dataset = { version: datasetVersionOf(documents), documents };
  const objective = input.objective ?? "balanced";

  const out = await optimize(
    {
      runId: bench.id,
      dataset,
      questions: opt,
      router,
      strategy: strategyFor("exhaustive"),
      objective,
      constraints: {},
      baselineConfig: BASELINE_CONFIG,
      space: enumerateSpace(),
    },
    { progress: (stage, done, total) => (bench.progress = { stage, done, total }) },
  );
  bench.progress = { stage: "Validating on held-out questions", done: 0, total: 1 };
  const v = val.length
    ? await validatePlans({
        dataset,
        questions: val,
        router,
        plans: Object.fromEntries(out.classes.map((c) => [c.questionClass, c.config])),
        fallback: out.fallback.config,
        baselineConfig: BASELINE_CONFIG,
        calibration: out.calibration,
      })
    : null;
  const empty = out.baseline && { ...out.baseline, n: 0 };

  return {
    generatedAt: new Date().toISOString(),
    datasetVersion: dataset.version,
    documents: documents.length,
    questions: { optimization: opt.length, validation: val.length, unscored: questions.length - scorable.length },
    objective,
    baselineConfig: BASELINE_CONFIG,
    optimization: { baseline: out.baseline, radar: out.routed },
    validation: {
      baseline: v?.baseline ?? empty,
      radar: v?.metrics ?? empty,
      measuredLatency: v?.measuredLatency ?? null,
      baselineMeasuredLatency: v?.baselineMeasuredLatency ?? null,
    },
    perClass: [...out.classes, out.fallback].map((c) => ({
      questionClass: c.questionClass,
      label: classLabel(router, c.questionClass),
      optimizationQuestions: c.questions,
      validation: v?.perClass[c.questionClass] ? { baseline: v.perClass[c.questionClass].baseline, radar: v.perClass[c.questionClass].metrics } : null,
      plan: c.config,
      reasons: c.explanation.reasons,
    })),
    fallbackPlan: out.fallback.config,
    integrity: computeIntegrity(questions, documents, [source]),
    configurationsTested: out.configurationsTested,
    calibration: out.calibration,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function reportMarkdown(b: Benchmark): string {
  const r = b.report;
  if (!r) return `# ${b.name}\n\nStatus: ${b.status}${b.error ? ` — ${b.error}` : ""}\n`;
  const row = (name: string, m: BenchmarkReport["validation"]["baseline"]) =>
    `| ${name} | ${pct(m.evidenceCoverage)} | ${pct(m.retrievalSuccess)} (95% CI ${pct(m.retrievalSuccessCI[0])}–${pct(m.retrievalSuccessCI[1])}) | ${pct(
      m.contextPrecision,
    )} | ${Math.round(m.contextTokens)} | $${m.estimatedCostUsd.toFixed(5)} |`;
  const lat = (l: BenchmarkReport["validation"]["measuredLatency"]) => (l ? `${Math.round(l.p50)} ms p50 / ${Math.round(l.p95)} ms p95` : "not measured");
  return `# Context Benchmark — ${b.name}

Generated ${r.generatedAt} · dataset ${r.datasetVersion} · ${r.documents} documents · objective: ${r.objective}

Questions: ${r.questions.optimization} optimization, ${r.questions.validation} held-out, ${r.questions.unscored} without required evidence (not scored).
${r.configurationsTested} configurations tested on optimization questions only.

## Held-out validation (questions never used for selection)

| | Evidence coverage | Retrieval success | Context precision | Context tokens | Estimated cost / query |
|---|---|---|---|---|---|
${row("Typical retrieval", r.validation.baseline)}
${row("RadarDB plans", r.validation.radar)}

Measured retrieval latency: typical ${lat(r.validation.baselineMeasuredLatency)}; RadarDB ${lat(r.validation.measuredLatency)}.
${r.validation.measuredLatency?.method ?? ""}

## Optimization set (used for selection; optimistic)

| | Evidence coverage | Retrieval success | Context precision | Context tokens | Estimated cost / query |
|---|---|---|---|---|---|
${row("Typical retrieval", r.optimization.baseline)}
${row("RadarDB plans", r.optimization.radar)}

## Plans by question class

${r.perClass
  .map(
    (c) =>
      `### ${c.label} (${c.optimizationQuestions} optimization questions)\n\n${c.validation ? `Held-out: ${pct(c.validation.baseline.evidenceCoverage)} → ${pct(c.validation.radar.evidenceCoverage)} evidence coverage (n=${c.validation.radar.n})\n\n` : "No held-out questions routed to this plan.\n\n"}${c.reasons.map((x) => `- ${x}`).join("\n")}`,
  )
  .join("\n\n")}

## Evaluation integrity

${r.integrity.passed ? "Passed." : "**Issues found.**"} Duplicates: ${r.integrity.duplicateQuestions.length}, near-duplicates across splits: ${r.integrity.nearDuplicatesAcrossSplits.length}, evidence missing from documents: ${r.integrity.missingEvidence.length}, duplicate documents: ${r.integrity.duplicateDocuments.length}.

## What these numbers mean

Evidence coverage measures whether retrieved context contains the evidence a correct answer needs. It does not measure LLM answer correctness. Cost is estimated (LLM input price × context tokens + reranker compute); latency is measured wall-clock retrieval time on the machine that ran the benchmark.
`;
}
