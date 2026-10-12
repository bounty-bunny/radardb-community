"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, FlaskConical, Info, Play, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Empty, PageHeader, SOURCE_META, Spinner } from "@/components/ui";
import { HowItWorks } from "@/components/diagrams";
import { DeployButton } from "@/components/deploy-button";
import { RunProgress } from "@/components/run-controls";
import { ComparisonTable, ConfidenceBadge, WhyThisPlan, headlineReason, metricRows } from "@/components/plan-ui";
import { classLabelOf, useWorkspace } from "@/components/workspace";
import { fmt, postJson } from "@/lib/client";
import { shortPlan } from "@/engine/labels";

function StartRun({ label = "Run optimizer", variant = "primary" as "primary" | "secondary" }) {
  const { data, refresh } = useWorkspace();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      icon={Play}
      loading={busy || !!data?.activeRun}
      onClick={async () => {
        setBusy(true);
        try {
          await postJson("/api/runs", { objective: "balanced", strategy: "exhaustive" });
          await refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {data?.activeRun ? "Optimizing…" : label}
    </Button>
  );
}

export default function OverviewPage() {
  const { data } = useWorkspace();
  if (!data) return <Spinner className="mt-20 size-6" />;

  // Lead with production; otherwise the newest plan set awaiting deployment.
  const shown = data.deployed ?? data.latest;
  const rel = shown?.release;
  const v = rel?.validation;
  const synthetic = data.sources.some((s) => s.synthetic);
  const plans = (shown?.plans ?? []).slice().sort((a, b) => (a.questionClass === "*" ? 1 : b.questionClass === "*" ? -1 : 0));
  const newer =
    data.deployed && data.latest && data.latest.release.version > data.deployed.release.version && data.latest.release.status === "validated"
      ? data.latest.release
      : null;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Context optimizer for AI: RadarDB learns how your existing data should be retrieved for each kind of question, validates it on questions it never saw, and serves it through one API."
        actions={
          <>
            <Link href="/optimizer">
              <Button icon={FlaskConical}>View evaluation</Button>
            </Link>
            {!data.activeRun && <StartRun label={rel ? "Re-run optimizer" : "Run optimizer"} variant={rel ? "secondary" : "primary"} />}
          </>
        }
      />

      {synthetic && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5 text-xs text-fg-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warn" />
          <span>
            <b className="text-fg">Demo workspace.</b> All sources are synthetic fixtures and the {data.counts.questions} questions are not yet human-verified.
            These results show the mechanism, not real-world performance. Use <Link href="/benchmark" className="font-medium text-accent hover:underline">Benchmark</Link> to measure your own data.
          </span>
        </div>
      )}

      {data.activeRun && (
        <Card title="Optimizing" className="mb-6">
          <RunProgress progress={data.activeRun.progress} />
        </Card>
      )}

      {!rel && !data.activeRun && (
        <Card className="mb-6">
          <Empty
            icon={FlaskConical}
            title="No context plans yet"
            body={`RadarDB will try every retrieval configuration on ${data.counts.optimization} optimization questions, learn a plan per question class, then validate on ${data.counts.validation} held-out questions.`}
            action={<StartRun />}
          />
        </Card>
      )}

      {rel && v && (
        <section className="mb-6 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex flex-col gap-4 border-b border-line px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-fg">RadarDB found a better context plan</h2>
              <p className="mt-0.5 text-xs text-muted">
                {rel.status === "deployed" ? "In production: " : "Awaiting deployment: "}plan set v{rel.version} · validated on {v.questions} held-out questions never used during optimization · {fmt.rel(rel.validatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DeployButton release={rel} />
              <Link href="/optimizer">
                <Button variant="ghost" size="sm">
                  View evaluation <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid gap-0 lg:grid-cols-5">
            <div className="min-w-0 border-b border-line p-5 lg:col-span-2 lg:border-b-0 lg:border-r">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Held-out validation · required evidence coverage</div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted">Typical retrieval</div>
                  <div className="tnum text-3xl font-semibold tracking-tight text-fg-2">{fmt.pct(v.baseline.evidenceCoverage)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">RadarDB v{rel.version}</div>
                  <div className="tnum text-3xl font-semibold tracking-tight text-accent">{fmt.pct(v.metrics.evidenceCoverage)}</div>
                </div>
              </div>
              <div className="tnum mt-2 text-sm font-medium text-accent">{fmt.pts(v.metrics.evidenceCoverage - v.baseline.evidenceCoverage)}</div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                n = {v.questions}. Retrieval success 95% interval: typical {fmt.ci(v.baseline.retrievalSuccessCI)}, RadarDB {fmt.ci(v.metrics.retrievalSuccessCI)}. We measure whether the
                context contains the evidence a correct answer needs, not LLM answer accuracy.
              </p>
              {newer?.validation && (
                <p className="mt-2 text-xs text-warn">
                  A newer plan set, v{newer.version}, is validated ({fmt.pct(newer.validation.metrics.evidenceCoverage)} held-out coverage, {fmt.tokens(newer.validation.metrics.contextTokens)}{" "}
                  tokens). Review it on <Link href="/plans" className="underline">Context plans</Link>; deploying is explicit.
                </p>
              )}
            </div>
            <div className="min-w-0 p-5 lg:col-span-3">
              <ComparisonTable rows={metricRows(v.baseline, v.metrics, { typical: v.baselineMeasuredLatency, radar: v.measuredLatency })} radarLabel={`RadarDB v${rel.version}`} />
            </div>
          </div>
        </section>
      )}

      {rel && plans.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-fg">What RadarDB learned</h2>
              <p className="text-xs text-muted">One ContextPlan per question class, chosen on optimization questions and checked on held-out ones.</p>
            </div>
            <Link href="/plans" className="flex shrink-0 items-center gap-1 text-xs text-accent hover:underline">
              Context plans <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((p) => {
              const label = classLabelOf(data, p.questionClass);
              return (
                <div key={p.id} className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-fg">{label}</span>
                    <ConfidenceBadge plan={p} />
                  </div>
                  <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted">Selected</div>
                  <div className="text-sm font-medium text-fg">{shortPlan(p.config)}</div>
                  <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted">Why</div>
                  <p className="text-sm text-fg-2">
                    {p.questionClass === "*" ? "Used when the router isn't confident or a class has too few questions to learn its own plan. " : ""}
                    {headlineReason(p)}
                  </p>
                  <div className="tnum mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                      <div className="text-muted">Optimization</div>
                      <div className="font-semibold text-fg">
                        {fmt.pct(p.metrics.evidenceCoverage, 0)} <span className="font-normal text-muted">n={p.metrics.n}</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                      <div className="text-muted">Held-out</div>
                      <div className="font-semibold text-fg">
                        {p.validationMetrics?.n ? fmt.pct(p.validationMetrics.evidenceCoverage, 0) : "—"}{" "}
                        <span className="font-normal text-muted">n={p.validationMetrics?.n ?? 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-1">
                    <WhyThisPlan plan={p} label={label} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Card title="How RadarDB works" className="mb-6">
        <HowItWorks active={data.activeRun ? 4 : undefined} />
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Sources" actions={<Link href="/sources" className="text-xs text-accent hover:underline">Manage</Link>} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {data.sources.map((s) => {
              const m = SOURCE_META[s.kind];
              return (
                <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                  <m.icon className="size-4 text-muted" />
                  <span className="flex-1 text-sm text-fg">{s.name}</span>
                  {s.synthetic ? <Badge tone="warn">synthetic</Badge> : <Badge>{s.type}</Badge>}
                  <span className="tnum w-16 text-right text-xs text-muted">
                    {s.documentCount} doc{s.documentCount === 1 ? "" : "s"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Evaluation set" actions={<Link href="/evals" className="text-xs text-accent hover:underline">Open</Link>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="tnum text-2xl font-semibold text-fg">{data.counts.optimization}</div>
              <div className="text-xs text-muted">optimization questions</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="tnum text-2xl font-semibold text-fg">{data.counts.validation}</div>
              <div className="text-xs text-muted">held-out questions</div>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Splits are assigned once and persisted. Held-out questions never influence configuration selection, ranking or routing.
          </p>
          {data.lastRun?.integrity && (
            <p className="mt-2 text-xs">
              Integrity checks:{" "}
              {data.lastRun.integrity.passed ? <span className="font-medium text-accent">passed</span> : <span className="font-medium text-danger">issues found</span>}
              {data.lastRun.integrity.nearDuplicatesAcrossSplits.length > 0 && (
                <span className="text-muted"> · {data.lastRun.integrity.nearDuplicatesAcrossSplits.length} near-duplicate pair(s) across splits flagged</span>
              )}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
