"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, FlaskConical, Info, Play, X } from "lucide-react";
import type { IntegrityReport, Objective, OptimizerRun } from "@/core/domain";
import { Badge, Basis, Button, Card, ConfigChips, Empty, PageHeader, Segmented, Spinner } from "@/components/ui";
import { ParetoChart } from "@/components/charts";
import { IntegrityPanel } from "@/components/integrity";
import { RunProgress } from "@/components/run-controls";
import { ComparisonTable, metricRows } from "@/components/plan-ui";
import { DeployButton } from "@/components/deploy-button";
import { classLabelOf, useWorkspace } from "@/components/workspace";
import { fmt, postJson, useJson } from "@/lib/client";
import { SEARCH_SPACE } from "@/engine/optimizer/space";
import { CHUNKING_LABEL, EMBEDDING_LABEL, RETRIEVAL_LABEL } from "@/engine/labels";
import type { EvalQuestion } from "@/core/domain";

const OBJECTIVES: { value: Objective; label: string; hint: string }[] = [
  { value: "balanced", label: "Balanced", hint: "Within 3 pts of the best coverage and success, pick the lowest estimated cost." },
  { value: "quality", label: "Max quality", hint: "Highest retrieval success, then coverage, precision and fewer tokens." },
  { value: "cost", label: "Lowest cost", hint: "Cheapest plan that is at least as good as typical retrieval on the same questions." },
  { value: "latency", label: "Lowest latency", hint: "Within 3 pts of the best coverage and success, pick the lowest estimated latency." },
];

const inputCls =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 font-mono text-sm text-fg outline-none placeholder:text-muted focus:border-accent";

function RunSettings() {
  const { data, refresh } = useWorkspace();
  const [objective, setObjective] = useState<Objective>("balanced");
  const [strategy, setStrategy] = useState<"exhaustive" | "random">("exhaustive");
  const [samples, setSamples] = useState("80");
  const [maxTokens, setMaxTokens] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [maxLatency, setMaxLatency] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const num = (s: string) => (s.trim() ? Number(s) : null);
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">Objective</div>
        <Segmented value={objective} onChange={setObjective} options={OBJECTIVES} />
        <p className="mt-1.5 text-xs text-muted">{OBJECTIVES.find((o) => o.value === objective)!.hint}</p>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">Search strategy</div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: "exhaustive", label: "Exhaustive" },
              { value: "random", label: "Random sample" },
            ]}
          />
          {strategy === "random" && <input value={samples} onChange={(e) => setSamples(e.target.value)} className={clsx(inputCls, "w-24")} inputMode="numeric" aria-label="Samples" />}
        </div>
        <p className="mt-1.5 text-xs text-muted">Exhaustive search is the ground truth smarter strategies are benchmarked against. Bayesian and learned strategies plug into the same interface later.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Max tokens</span>
          <input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="none" inputMode="numeric" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Max cost <Basis kind="estimated" /></span>
          <input value={maxCost} onChange={(e) => setMaxCost(e.target.value)} placeholder="none" inputMode="decimal" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Max ms <Basis kind="estimated" /></span>
          <input value={maxLatency} onChange={(e) => setMaxLatency(e.target.value)} placeholder="none" inputMode="numeric" className={inputCls} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          icon={Play}
          loading={busy || !!data?.activeRun}
          onClick={async () => {
            setBusy(true);
            setErr(undefined);
            try {
              await postJson("/api/runs", {
                objective,
                strategy,
                ...(strategy === "random" ? { samples: Number(samples) || 80 } : {}),
                constraints: { maxTokens: num(maxTokens), maxCostUsd: num(maxCost), maxLatencyMs: num(maxLatency) },
              });
              await refresh();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {data?.activeRun ? "Optimizing…" : "Start optimization"}
        </Button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </div>
  );
}

function SearchSpace() {
  const total = SEARCH_SPACE.chunkingStrategy.length * SEARCH_SPACE.retrieval.length * 2 * 2 * SEARCH_SPACE.reranker.length * SEARCH_SPACE.topK.length;
  const dims = [
    { name: "Chunking", values: SEARCH_SPACE.chunkingStrategy.map((c) => CHUNKING_LABEL[c]) },
    {
      name: "Retrieval",
      values: SEARCH_SPACE.retrieval.map((r) => RETRIEVAL_LABEL[r.retrievalStrategy] + (r.embeddingModel ? ` · ${EMBEDDING_LABEL[r.embeddingModel]}` : "")),
    },
    { name: "Exact-ID boost", values: ["off", "on"] },
    { name: "Entity graph", values: ["off", "expansion"] },
    { name: "Reranker", values: ["none", "cross-encoder"] },
    { name: "Top-k", values: SEARCH_SPACE.topK.map(String) },
  ];
  return (
    <>
      <dl className="space-y-2">
        {dims.map((d) => (
          <div key={d.name} className="flex flex-col gap-1 sm:flex-row sm:items-start">
            <dt className="w-28 shrink-0 pt-0.5 text-xs font-medium text-muted">{d.name}</dt>
            <dd className="flex flex-wrap gap-1">
              {d.values.map((v) => (
                <span key={v} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-2">
                  {v}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        <b className="tnum text-fg">{total}</b> configurations. Every experiment (configuration × question) is recorded so a learned optimizer can be trained later.
      </p>
    </>
  );
}

export default function OptimizerPage() {
  const ws = useWorkspace();
  const runId = ws.data?.activeRun?.id ?? ws.data?.lastRun?.id ?? null;
  const { data: run } = useJson<OptimizerRun>(runId ? `/api/runs/${runId}` : null, { pollMs: (r) => (r?.status === "running" ? 1500 : null) });
  const { data: questions } = useJson<(EvalQuestion & { routed: { class: string } })[]>("/api/evals");
  const release = ws.data?.latest?.release.runId === run?.id ? ws.data?.latest?.release : undefined;
  const qById = useMemo(() => new Map((questions ?? []).map((q) => [q.id, q])), [questions]);
  const leaderboard = useMemo(
    () =>
      [...(run?.trials ?? [])]
        .sort((a, b) => b.optimization.evidenceCoverage - a.optimization.evidenceCoverage || a.optimization.contextTokens - b.optimization.contextTokens)
        .slice(0, 15),
    [run],
  );

  if (!ws.data) return <Spinner className="mt-20 size-6" />;
  const v = release?.validation;

  return (
    <>
      <PageHeader
        title="Optimizer"
        description="Searches retrieval configurations on optimization questions only, learns a ContextPlan per question class, then validates the chosen plans on held-out questions."
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Card title="Run settings" className="lg:col-span-2">
          <RunSettings />
        </Card>
        <Card title="Search space" className="lg:col-span-3">
          <SearchSpace />
        </Card>
      </div>

      {ws.data.activeRun && (
        <Card title="Run in progress" className="mb-6">
          <RunProgress progress={ws.data.activeRun.progress} />
        </Card>
      )}

      {!run && !ws.data.activeRun && (
        <Card>
          <Empty icon={FlaskConical} title="No runs yet" body="Start an optimization to compare typical retrieval with every alternative configuration." />
        </Card>
      )}

      {run?.status === "failed" && (
        <Card className="mb-6">
          <p className="text-sm text-danger">Run failed: {run.error}</p>
        </Card>
      )}

      {run && run.status === "completed" && (
        <>
          <div className="tnum mb-6 flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-line bg-surface px-5 py-3 text-xs text-muted shadow-card">
            <span>
              Run <b className="font-mono text-fg">{run.id}</b>
            </span>
            <span>dataset {run.datasetVersion}</span>
            <span>router {run.routerVersion}</span>
            <span>
              {run.strategy.name} · objective {run.objective}
            </span>
            <span>
              {run.configurationsTested}/{run.searchSpaceSize} configurations · {run.distinctBehaviors} behaviorally distinct
            </span>
            {run.calibration && (
              <span title={run.calibration.method}>
                calibration: embed {fmt.ms(run.calibration.embedQueryMs)}, rerank {fmt.ms(run.calibration.rerankPerPairMs)}/pair
              </span>
            )}
          </div>

          {run.integrity && (
            <Card title="Evaluation integrity" description="Checked before every run" className="mb-6">
              <IntegrityPanel report={run.integrity} />
            </Card>
          )}

          {release && v && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  Held-out validation <Badge tone="accent">never used for selection</Badge>
                </span>
              }
              description={`${v.questions} questions · plan set v${release.version} vs typical retrieval`}
              actions={<DeployButton release={release} size="sm" />}
              className="mb-6"
            >
              <ComparisonTable rows={metricRows(v.baseline, v.metrics, { typical: v.baselineMeasuredLatency, radar: v.measuredLatency })} radarLabel={`RadarDB v${release.version}`} />
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(v.perClass).map(([cls, m]) => (
                  <div key={cls} className="rounded-lg border border-line px-3 py-2 text-xs">
                    <div className="font-medium text-fg">
                      {classLabelOf(ws.data, cls)} <span className="font-normal text-muted">n={m.metrics.n}</span>
                    </div>
                    <div className="tnum text-muted">
                      coverage {fmt.pct(m.baseline.evidenceCoverage, 0)} → <b className="text-accent">{fmt.pct(m.metrics.evidenceCoverage, 0)}</b>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {release && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  Optimization set <Badge tone="warn">used for selection · optimistic</Badge>
                </span>
              }
              description={`${release.optimization.questions} questions. Plans were chosen to do well here, so expect these numbers to overstate real performance.`}
              className="mb-6"
            >
              <ComparisonTable rows={metricRows(release.optimization.baseline, release.optimization.metrics)} radarLabel={`RadarDB v${release.version}`} />
            </Card>
          )}

          <div className="mb-6 grid gap-6 lg:grid-cols-5">
            <Card title="Every configuration tried" description="Optimization set. Pareto-optimal across coverage, precision, tokens, estimated latency and cost." className="lg:col-span-3">
              {run.baseline && <ParetoChart trials={run.trials} baseline={run.baseline.optimization} selected={release?.optimization.metrics} />}
              <p className="mt-2 text-xs text-muted">
                {run.trials.filter((t) => t.pareto).length} of {run.trials.length} configurations are on the Pareto frontier: each is a legitimate trade-off.
              </p>
            </Card>
            <Card title="Held-out, question by question" className="lg:col-span-2" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {(run.validationResults ?? []).map((r) => (
                  <li key={r.questionId} className="flex items-start gap-3 px-5 py-2.5">
                    <span className="mt-0.5 font-mono text-[11px] text-muted">{r.questionId}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-fg">{qById.get(r.questionId)?.question ?? r.questionId}</div>
                      <div className="text-[11px] text-muted">plan: {classLabelOf(ws.data, r.planClass)}</div>
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted" title="typical → RadarDB (all evidence retrieved)">
                      {r.baseline.success ? <Check className="size-3.5 text-accent" /> : <X className="size-3.5 text-danger" />}→
                      {r.plan.success ? <Check className="size-3.5 text-accent" /> : <X className="size-3.5 text-danger" />}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title="Leaderboard" description="Top configurations on the optimization set (single configuration for every question)" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="py-2 pl-5 pr-3 font-medium">#</th>
                    <th className="px-3 font-medium">Configuration</th>
                    <th className="px-3 text-right font-medium">Coverage</th>
                    <th className="px-3 text-right font-medium">Precision</th>
                    <th className="px-3 text-right font-medium">Tokens</th>
                    <th className="px-3 pr-5 text-right font-medium">
                      Latency <Basis kind="estimated" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((t, i) => (
                    <tr key={t.key} className="border-t border-line">
                      <td className="tnum py-2.5 pl-5 pr-3 text-xs text-muted">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ConfigChips config={t.config} />
                          {t.pareto && <Badge tone="accent">Pareto</Badge>}
                        </div>
                      </td>
                      <td className="tnum px-3 text-right text-sm text-fg">{fmt.pct(t.optimization.evidenceCoverage)}</td>
                      <td className="tnum px-3 text-right text-sm text-fg-2">{fmt.pct(t.optimization.contextPrecision)}</td>
                      <td className="tnum px-3 text-right text-sm text-fg-2">{fmt.tokens(t.optimization.contextTokens)}</td>
                      <td className="tnum px-3 pr-5 text-right text-sm text-fg-2">{fmt.ms(t.optimization.estimatedLatencyMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Estimated latency = measured in-process search time + model inference timings calibrated on this machine. Measured latency (held-out table) is wall-clock per request with
            uncached model inference.
          </p>
        </>
      )}
    </>
  );
}
