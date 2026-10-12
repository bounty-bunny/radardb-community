"use client";

import { useMemo, useState } from "react";
import type { Metrics, TrialSummary } from "@/core/domain";
import { ConfigChips } from "./ui";
import { fmt } from "@/lib/client";

const W = 640;
const H = 300;
const M = { l: 44, r: 16, t: 14, b: 34 };

/**
 * Every configuration tried (optimization set): evidence coverage vs context
 * tokens. Pareto-optimal configurations (across coverage, precision, tokens,
 * estimated latency and cost) are highlighted.
 */
export function ParetoChart({ trials, baseline, selected }: { trials: TrialSummary[]; baseline: Metrics; selected?: Metrics }) {
  const [hover, setHover] = useState<{ t: TrialSummary; x: number; y: number } | null>(null);

  const { xs, ys, xTicks, yTicks } = useMemo(() => {
    const tokens = [...trials.map((t) => t.optimization.contextTokens), baseline.contextTokens, ...(selected ? [selected.contextTokens] : [])];
    const lo = 0;
    const hi = Math.max(...tokens) * 1.05;
    const covs = [...trials.map((t) => t.optimization.evidenceCoverage), baseline.evidenceCoverage];
    const yLo = Math.max(0, Math.floor(Math.min(...covs) * 10) / 10 - 0.05);
    const xs = (c: number) => M.l + ((c - lo) / (hi - lo)) * (W - M.l - M.r);
    const ys = (a: number) => H - M.b - ((a - yLo) / (1 - yLo)) * (H - M.t - M.b);
    const xTicks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
    const yTicks: number[] = [];
    for (let a = Math.ceil(yLo * 10) / 10; a <= 1.0001; a += 0.1) yTicks.push(a);
    return { xs, ys, xTicks, yTicks };
  }, [trials, baseline, selected]);

  const jitter = (key: string) => {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return ((h % 1000) / 1000) * 5 - 2.5;
  };
  const ordered = [...trials].sort((a, b) => Number(a.pareto) - Number(b.pareto));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evidence coverage versus context tokens for every configuration tried">
        {yTicks.map((a) => (
          <g key={a}>
            <line x1={M.l} x2={W - M.r} y1={ys(a)} y2={ys(a)} stroke="var(--line)" />
            <text x={M.l - 8} y={ys(a)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted)" className="tnum">
              {Math.round(a * 100)}%
            </text>
          </g>
        ))}
        {xTicks.map((c) => (
          <text key={c} x={xs(c)} y={H - M.b + 16} textAnchor="middle" fontSize="10" fill="var(--muted)" className="tnum">
            {Math.round(c)}
          </text>
        ))}
        <text x={W - M.r} y={H - 4} textAnchor="end" fontSize="10" fill="var(--muted)">
          context tokens →
        </text>
        <text x={M.l} y={M.t - 4} fontSize="10" fill="var(--muted)">
          evidence coverage
        </text>

        {ordered.map((t) => (
          <circle
            key={t.key}
            cx={xs(t.optimization.contextTokens)}
            cy={ys(t.optimization.evidenceCoverage) + (t.pareto ? 0 : jitter(t.key))}
            r={t.pareto ? 4 : 2.8}
            fill={t.pareto ? "var(--accent)" : "var(--chart-dot)"}
            fillOpacity={t.pareto ? 0.9 : 0.5}
            onMouseEnter={() => setHover({ t, x: xs(t.optimization.contextTokens), y: ys(t.optimization.evidenceCoverage) })}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        <g>
          <circle cx={xs(baseline.contextTokens)} cy={ys(baseline.evidenceCoverage)} r={6} fill="var(--surface)" stroke="var(--danger)" strokeWidth={2} />
          <text x={xs(baseline.contextTokens) - 10} y={ys(baseline.evidenceCoverage) + 4} textAnchor="end" fontSize="11" fontWeight={600} fill="var(--danger)">
            Typical retrieval
          </text>
        </g>
        {selected && (
          <g>
            <circle cx={xs(selected.contextTokens)} cy={ys(selected.evidenceCoverage)} r={7} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
            <text x={xs(selected.contextTokens) + 11} y={ys(selected.evidenceCoverage) + 16} fontSize="11" fontWeight={600} fill="var(--accent)">
              RadarDB plans
            </text>
          </g>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" /> Pareto-optimal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: "var(--chart-dot)" }} /> Dominated
        </span>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-72 rounded-lg border border-line bg-surface p-2.5 text-xs shadow-lg"
          style={{ left: `min(calc(${(hover.x / W) * 100}% + 8px), calc(100% - 18rem))`, top: `${(hover.y / H) * 100}%` }}
        >
          <ConfigChips config={hover.t.config} />
          <div className="tnum mt-2 grid grid-cols-2 gap-x-3 text-fg-2">
            <span>coverage {fmt.pct(hover.t.optimization.evidenceCoverage)}</span>
            <span>precision {fmt.pct(hover.t.optimization.contextPrecision)}</span>
            <span>{fmt.tokens(hover.t.optimization.contextTokens)} tokens</span>
            <span>est. {fmt.ms(hover.t.optimization.estimatedLatencyMs)}</span>
          </div>
          {hover.t.pareto && <div className="mt-1 font-medium text-accent">Pareto-optimal</div>}
        </div>
      )}
    </div>
  );
}

/** Paired horizontal bars: before vs after per category. */
export function CompareBars({ rows }: { rows: { label: string; before: number; after: number; n: number }[] }) {
  return (
    <div className="space-y-3.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-fg">
              {r.label} <span className="font-normal text-muted">· n={r.n}</span>
            </span>
            <span className="tnum text-muted">
              {fmt.pct(r.before, 0)} → <span className="font-semibold text-accent">{fmt.pct(r.after, 0)}</span>
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-surface-3">
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${r.after * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-line-strong" style={{ width: `${r.before * 100}%` }} />
          </div>
        </div>
      ))}
      <div className="flex gap-4 pt-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-line-strong" /> Typical retrieval
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" /> RadarDB
        </span>
      </div>
    </div>
  );
}
