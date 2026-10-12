"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { ArrowDown, RotateCcw, Route, Split } from "lucide-react";
import type { ContextRequest } from "@/core/domain";
import { Badge, Basis, Button, Card, Empty, PageHeader, Spinner, type Tone } from "@/components/ui";
import { PipelineFlow } from "@/components/diagrams";
import { DeployButton } from "@/components/deploy-button";
import { ConfidenceBadge, WhyThisPlan } from "@/components/plan-ui";
import { classLabelOf, useWorkspace } from "@/components/workspace";
import { fmt, postJson, useJson } from "@/lib/client";
import type { ReleaseView } from "@/server/views";
import type { DriftReport } from "@/server/drift";

const STATUS_TONE: Record<string, Tone> = { deployed: "accent", validated: "info", candidate: "warn", retired: "neutral" };

function Rollback({ onDone }: { onDone: () => void }) {
  const { refresh } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <span className="flex items-center gap-2">
      {err && <span className="text-xs text-danger">{err}</span>}
      <Button
        icon={RotateCcw}
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setErr(undefined);
          try {
            await postJson("/api/plans/rollback", {});
            await refresh();
            onDone();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Roll back
      </Button>
    </span>
  );
}

function ReleaseDetail({ view }: { view: ReleaseView }) {
  const { data: ws } = useWorkspace();
  const classPlans = view.plans.filter((p) => p.questionClass !== "*");
  const fallback = view.plans.find((p) => p.questionClass === "*");
  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-md flex-col items-center gap-1 text-center">
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-fg">POST /api/v1/context</div>
        <ArrowDown className="size-3.5 text-muted" />
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg">
          <Split className="size-3.5 text-accent" /> router {view.release.routerVersion} · fallback below confidence {ws?.router.fallbackThreshold}
        </div>
        <ArrowDown className="size-3.5 text-muted" />
      </div>
      <div className="space-y-3">
        {[...classPlans, ...(fallback ? [fallback] : [])].map((p) => {
          const label = classLabelOf(ws, p.questionClass);
          return (
            <div key={p.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-fg">{label}</span>
                  <span className="font-mono text-[11px] text-muted">{p.id}</span>
                  <ConfidenceBadge plan={p} />
                </div>
                <div className="tnum flex items-center gap-3 text-xs text-muted">
                  <span>
                    optimization {fmt.pct(p.metrics.evidenceCoverage, 0)} (n={p.metrics.n})
                  </span>
                  <span>
                    held-out {p.validationMetrics?.n ? fmt.pct(p.validationMetrics.evidenceCoverage, 0) : "—"} (n={p.validationMetrics?.n ?? 0})
                  </span>
                  <WhyThisPlan plan={p} label={label} />
                </div>
              </div>
              <PipelineFlow config={p.config} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DriftPanel() {
  const { data } = useJson<DriftReport>("/api/drift");
  if (!data) return <Spinner />;
  const tone: Record<string, Tone> = { ok: "accent", warn: "warn", "insufficient-data": "neutral", "not-applicable": "neutral" };
  return (
    <div>
      {data.signals.length === 0 ? (
        <p className="text-sm text-muted">{data.recommendation}</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {data.signals.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-2">
                <Badge tone={tone[s.status]} className="mt-0.5 w-28 justify-center">
                  {s.status}
                </Badge>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">{s.label}</div>
                  <div className="text-xs text-muted">{s.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-2">{data.recommendation}</p>
        </>
      )}
    </div>
  );
}

function RequestsTable() {
  const { data: ws } = useWorkspace();
  const { data } = useJson<ContextRequest[]>("/api/requests?limit=15", { pollMs: 5000 });
  if (!data) return <Spinner />;
  if (!data.length) return <p className="px-5 py-6 text-sm text-muted">No production requests yet. Call POST /api/v1/context (see API).</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 pl-5 pr-3 font-medium">Time</th>
            <th className="px-3 font-medium">Query</th>
            <th className="px-3 font-medium">Class</th>
            <th className="px-3 font-medium">Plan</th>
            <th className="px-3 text-right font-medium">Tokens</th>
            <th className="px-3 pr-5 text-right font-medium">
              Latency <Basis kind="measured" />
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="whitespace-nowrap py-2 pl-5 pr-3 text-xs text-muted">{new Date(r.timestamp).toLocaleTimeString()}</td>
              <td className="max-w-xs truncate px-3 text-sm text-fg" title={r.query}>
                {r.query ?? <span className="text-muted">({r.queryChars} chars, not logged)</span>}
              </td>
              <td className="px-3 text-xs text-fg-2">
                {classLabelOf(ws, r.detectedClass)} <span className="text-muted">{r.routerConfidence.toFixed(2)}</span>
                {r.fallbackUsed && <Badge className="ml-1">fallback</Badge>}
              </td>
              <td className="px-3 font-mono text-[11px] text-muted">v{r.planVersion}</td>
              <td className="tnum px-3 text-right text-sm text-fg-2">{r.tokenCount}</td>
              <td className="tnum px-3 pr-5 text-right text-sm text-fg-2">{fmt.ms(r.measuredLatencyMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlansPage() {
  const { data: ws } = useWorkspace();
  const { data: releases, refresh } = useJson<ReleaseView[]>("/api/plans");
  const [selected, setSelected] = useState<string | null>(null);
  if (!ws || !releases) return <Spinner className="mt-20 size-6" />;

  const prod = releases.find((r) => r.release.status === "deployed");
  const canRollback = releases.some((r) => r.release.status === "retired" && r.release.deployedAt);
  const shown = releases.find((r) => r.release.id === selected) ?? prod ?? releases[0];

  if (!releases.length)
    return (
      <>
        <PageHeader title="Context plans" description="Versioned, immutable sets of ContextPlans. One plan per question class plus a fallback." />
        <Card>
          <Empty
            icon={Route}
            title="No plans yet"
            body="Run the optimizer. Each run creates a new candidate plan set, validates it on held-out questions, and waits for you to deploy it."
            action={
              <Link href="/optimizer">
                <Button variant="primary">Go to optimizer</Button>
              </Link>
            }
          />
        </Card>
      </>
    );

  return (
    <>
      <PageHeader
        title="Context plans"
        description="Versioned, immutable plan sets. A new optimizer run creates a new version; production only changes when you deploy or roll back."
      />

      <Card className="mb-6" bodyClassName="p-0">
        <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
          {prod ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Production</div>
              <div className="text-lg font-semibold text-fg">ContextPlan set v{prod.release.version}</div>
              <div className="tnum mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>deployed {fmt.rel(prod.release.deployedAt)}</span>
                {prod.release.validation && (
                  <>
                    <span>validated on {prod.release.validation.questions} unseen questions</span>
                    <span>
                      held-out evidence coverage <b className="text-accent">{fmt.pct(prod.release.validation.metrics.evidenceCoverage)}</b>
                    </span>
                    {prod.release.validation.measuredLatency && (
                      <span>
                        p95 {fmt.ms(prod.release.validation.measuredLatency.p95)} <Basis kind="measured" />
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Production</div>
              <div className="text-lg font-semibold text-fg">Nothing deployed</div>
              <div className="text-xs text-muted">/api/v1/context returns 409 until a validated plan set is deployed.</div>
            </div>
          )}
          {canRollback && prod && <Rollback onDone={refresh} />}
        </div>
      </Card>

      <Card title="Versions" bodyClassName="p-0" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pl-5 pr-3 font-medium">Version</th>
                <th className="px-3 font-medium">Status</th>
                <th className="px-3 font-medium">Created</th>
                <th className="px-3 text-right font-medium">Held-out n</th>
                <th className="px-3 text-right font-medium">Held-out coverage</th>
                <th className="px-3 font-medium">Run</th>
                <th className="pl-3 pr-5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {releases.map(({ release: r }) => (
                <tr key={r.id} className={clsx("border-t border-line", shown?.release.id === r.id && "bg-surface-2")}>
                  <td className="py-2.5 pl-5 pr-3 text-sm font-semibold text-fg">v{r.version}</td>
                  <td className="px-3">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status === "retired" && r.deployedAt ? "retired · rollback available" : r.status}</Badge>
                  </td>
                  <td className="px-3 text-xs text-muted">{fmt.rel(r.createdAt)}</td>
                  <td className="tnum px-3 text-right text-sm text-fg-2">{r.validation?.questions ?? "—"}</td>
                  <td className="tnum px-3 text-right text-sm text-fg">{fmt.pct(r.validation?.metrics.evidenceCoverage)}</td>
                  <td className="px-3 font-mono text-[11px] text-muted">{r.runId}</td>
                  <td className="pl-3 pr-5">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(r.id)}>
                        View
                      </Button>
                      <a
                        href={`/api/plans/export?releaseId=${encodeURIComponent(r.id)}`}
                        download
                        title="Download this plan set as a portable radardb.plan-release v1 JSON document"
                        className="inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        Export JSON
                      </a>
                      {r.status !== "deployed" && <DeployButton release={r} size="sm" label="Deploy" onDone={refresh} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {shown && (
        <Card
          title={`Plan set v${shown.release.version}`}
          description={`${shown.release.status} · dataset ${shown.release.datasetVersion} · each query is routed to one plan; the plan version is recorded on every request`}
          className="mb-6"
        >
          <ReleaseDetail view={shown} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Drift signals" description="Signals only. Re-optimization and deployment stay human-approved." className="lg:col-span-2">
          <DriftPanel />
        </Card>
        <Card title="Recent production requests" description="References only; document content is never stored in traces" className="lg:col-span-3" bodyClassName="p-0">
          <RequestsTable />
        </Card>
      </div>
    </>
  );
}
