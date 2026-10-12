"use client";

import { useState } from "react";
import clsx from "clsx";
import { HelpCircle } from "lucide-react";
import type { ContextPlan, LatencyStats, Metrics } from "@/core/domain";
import { shortPlan } from "@/engine/labels";
import { Badge, Basis, Button, ConfigChips, Modal, type Tone } from "./ui";
import { PipelineFlow } from "./diagrams";
import { fmt } from "@/lib/client";

interface Row {
  label: string;
  basis?: "measured" | "estimated";
  typical: string;
  radar: string;
  delta?: string;
  good?: boolean;
  hint?: string;
}

export function metricRows(typical: Metrics, radar: Metrics, latency?: { typical: LatencyStats | null; radar: LatencyStats | null }): Row[] {
  const d = (a: number, b: number) => b - a;
  const rows: Row[] = [
    {
      label: "Required evidence coverage",
      typical: fmt.pct(typical.evidenceCoverage),
      radar: fmt.pct(radar.evidenceCoverage),
      delta: fmt.pts(d(typical.evidenceCoverage, radar.evidenceCoverage)),
      good: radar.evidenceCoverage >= typical.evidenceCoverage,
      hint: "Mean share of required evidence present in the retrieved context",
    },
    {
      label: "Retrieval success",
      typical: `${fmt.pct(typical.retrievalSuccess)} (${fmt.ci(typical.retrievalSuccessCI)})`,
      radar: `${fmt.pct(radar.retrievalSuccess)} (${fmt.ci(radar.retrievalSuccessCI)})`,
      delta: fmt.pts(d(typical.retrievalSuccess, radar.retrievalSuccess)),
      good: radar.retrievalSuccess >= typical.retrievalSuccess,
      hint: "Questions with ALL required evidence retrieved; 95% Wilson interval in brackets",
    },
    {
      label: "Context precision",
      typical: fmt.pct(typical.contextPrecision),
      radar: fmt.pct(radar.contextPrecision),
      delta: fmt.pts(d(typical.contextPrecision, radar.contextPrecision)),
      good: radar.contextPrecision >= typical.contextPrecision,
      hint: "Share of returned context items that contain required evidence",
    },
    {
      label: "Context tokens",
      typical: fmt.tokens(typical.contextTokens),
      radar: fmt.tokens(radar.contextTokens),
      delta: `${Math.round(fmt.change(typical.contextTokens, radar.contextTokens) * 100)}%`,
      good: radar.contextTokens <= typical.contextTokens,
    },
  ];
  if (latency?.typical && latency.radar)
    rows.push({
      label: "Retrieval latency p50 / p95",
      basis: "measured",
      typical: `${fmt.ms(latency.typical.p50)} / ${fmt.ms(latency.typical.p95)}`,
      radar: `${fmt.ms(latency.radar.p50)} / ${fmt.ms(latency.radar.p95)}`,
      good: latency.radar.p95 <= latency.typical.p95,
      hint: latency.radar.method,
    });
  rows.push({
    label: "Cost per query",
    basis: "estimated",
    typical: fmt.usd(typical.estimatedCostUsd),
    radar: fmt.usd(radar.estimatedCostUsd),
    delta: `${Math.round(fmt.change(typical.estimatedCostUsd, radar.estimatedCostUsd) * 100)}%`,
    good: radar.estimatedCostUsd <= typical.estimatedCostUsd,
    hint: "LLM input price × context tokens + reranker compute (cost.ts)",
  });
  return rows;
}

export function ComparisonTable({ rows, radarLabel = "RadarDB" }: { rows: Row[]; radarLabel?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 pr-3 font-medium">Metric</th>
            <th className="px-3 text-right font-medium">Typical retrieval</th>
            <th className="px-3 text-right font-medium">{radarLabel}</th>
            <th className="pl-3 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-2.5 pr-3 text-sm text-fg" title={r.hint}>
                {r.label}
                {r.basis && <Basis kind={r.basis} />}
              </td>
              <td className="tnum px-3 text-right text-sm text-fg-2">{r.typical}</td>
              <td className="tnum px-3 text-right text-sm font-semibold text-fg">{r.radar}</td>
              <td className={clsx("tnum pl-3 text-right text-xs font-medium", r.good ? "text-accent" : "text-danger")}>{r.delta ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CONF_TONE: Record<ContextPlan["confidence"]["level"], Tone> = { high: "accent", medium: "info", low: "warn" };

export function ConfidenceBadge({ plan }: { plan: ContextPlan }) {
  return (
    <Badge tone={CONF_TONE[plan.confidence.level]} className="cursor-help">
      <span title={plan.confidence.reason}>{plan.confidence.level} confidence</span>
    </Badge>
  );
}

export function WhyThisPlan({ plan, label, size = "sm" }: { plan: ContextPlan; label: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const e = plan.explanation;
  return (
    <>
      <Button size={size} variant="secondary" icon={HelpCircle} onClick={() => setOpen(true)}>
        Why this plan?
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Why this plan? · ${label} · v${plan.version}`} wide>
        <div className="space-y-5">
          <div>
            <PipelineFlow config={plan.config} />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <ConfidenceBadge plan={plan} />
              <span>{plan.confidence.reason}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { k: "Optimization questions", v: e.optimizationQuestions },
              { k: "Configurations evaluated", v: e.configurationsEvaluated },
              { k: "Within constraints", v: e.configurationsWithinConstraints || "—" },
            ].map((x) => (
              <div key={x.k} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="tnum text-lg font-semibold text-fg">{x.v}</div>
                <div className="text-[11px] text-muted">{x.k}</div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Best configuration per retrieval family (optimization set)</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="py-1.5 pr-3 font-medium">Family</th>
                    <th className="px-2 text-right font-medium">Coverage</th>
                    <th className="px-2 text-right font-medium">Success</th>
                    <th className="px-2 text-right font-medium">Precision</th>
                    <th className="px-2 text-right font-medium">Tokens</th>
                    <th className="pl-2 text-right font-medium">
                      Cost <Basis kind="estimated" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {e.alternatives.map((a) => (
                    <tr key={a.label} className={clsx("border-t border-line", a.selected && "bg-accent-soft/50")}>
                      <td className="py-2 pr-3 text-sm">
                        <div className="flex items-center gap-2 font-medium text-fg">
                          {a.label}
                          {a.selected && <Badge tone="accent">selected</Badge>}
                        </div>
                        <div className="text-[11px] text-muted">{shortPlan(a.config)}</div>
                      </td>
                      <td className="tnum px-2 text-right text-sm text-fg">{fmt.pct(a.metrics.evidenceCoverage, 0)}</td>
                      <td className="tnum px-2 text-right text-sm text-fg-2">{fmt.pct(a.metrics.retrievalSuccess, 0)}</td>
                      <td className="tnum px-2 text-right text-sm text-fg-2">{fmt.pct(a.metrics.contextPrecision, 0)}</td>
                      <td className="tnum px-2 text-right text-sm text-fg-2">{fmt.tokens(a.metrics.contextTokens)}</td>
                      <td className="tnum pl-2 text-right text-sm text-fg-2">{fmt.usd(a.metrics.estimatedCostUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {e.ablations.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Change one component</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {e.ablations.map((a) => {
                  const d = a.metrics.evidenceCoverage - plan.metrics.evidenceCoverage;
                  return (
                    <li key={a.change} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                      <span className="text-fg-2">{a.change}</span>
                      <span className={clsx("tnum text-xs font-medium", Math.abs(d) < 0.005 ? "text-muted" : d > 0 ? "text-accent" : "text-danger")}>
                        {fmt.pct(a.metrics.evidenceCoverage, 0)} ({fmt.pts(d)})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Reasoning</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-2">
              {e.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
            <span className="font-medium text-fg">Held-out validation: </span>
            {plan.validationMetrics?.n ? (
              <span className="text-fg-2">
                {fmt.pct(plan.validationMetrics.evidenceCoverage)} evidence coverage on {plan.validationMetrics.n} question
                {plan.validationMetrics.n === 1 ? "" : "s"} never used for selection.
              </span>
            ) : (
              <span className="text-muted">no held-out questions were routed to this plan.</span>
            )}
          </div>
          <div>
            <ConfigChips config={plan.config} />
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Data-derived one-liner for "What RadarDB learned" cards: the most informative reason. */
export function headlineReason(plan: ContextPlan): string {
  const e = plan.explanation;
  const biggest = [...e.ablations].sort(
    (a, b) => Math.abs(b.metrics.evidenceCoverage - plan.metrics.evidenceCoverage) - Math.abs(a.metrics.evidenceCoverage - plan.metrics.evidenceCoverage),
  )[0];
  if (biggest && Math.abs(biggest.metrics.evidenceCoverage - plan.metrics.evidenceCoverage) >= 0.05)
    return `${biggest.change[0].toUpperCase() + biggest.change.slice(1)}, evidence coverage would be ${fmt.pct(biggest.metrics.evidenceCoverage, 0)} (${fmt.pts(
      biggest.metrics.evidenceCoverage - plan.metrics.evidenceCoverage,
    )}).`;
  const rival = e.alternatives.filter((a) => !a.selected).sort((a, b) => b.metrics.evidenceCoverage - a.metrics.evidenceCoverage)[0];
  if (rival)
    return `Best alternative (${rival.label}) reaches ${fmt.pct(rival.metrics.evidenceCoverage, 0)} with ${fmt.tokens(rival.metrics.contextTokens)} tokens; this plan uses ${fmt.tokens(
      plan.metrics.contextTokens,
    )}.`;
  return e.reasons[0] ?? "";
}
