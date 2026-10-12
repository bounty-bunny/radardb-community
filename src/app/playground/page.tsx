"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowRight, Check, ChevronRight, CornerDownLeft, Info, X } from "lucide-react";
import type { ContextItem, EvalQuestion, TraceStep } from "@/core/domain";
import { Badge, Basis, Button, Card, PageHeader, SourceBadge } from "@/components/ui";
import { classLabelOf, useWorkspace } from "@/components/workspace";
import { fmt, postJson, useJson } from "@/lib/client";
import type { ContextResponse } from "@/server/dataplane";

interface PlaygroundResult {
  baseline: { context: ContextItem[]; strategy: string[]; trace: TraceStep[]; metrics: { measuredLatencyMs: number; contextTokens: number; estimatedCostUsd: number } };
  deployed: ContextResponse | null;
  evidence: {
    questionId: string;
    split: string;
    facts: string[];
    baseline: { hits: boolean[] };
    deployed: { hits: boolean[] } | null;
  } | null;
}

function highlight(text: string, phrases: string[]): ReactNode {
  const ps = phrases.filter((p) => p.length > 3);
  if (!ps.length) return text;
  const re = new RegExp(`(${ps.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent-strong">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const METHOD_LABEL: Record<string, string> = {
  lexical: "lexical",
  vector: "vector",
  hybrid: "hybrid",
  "exact-match": "exact-ID match",
  "graph-expansion": "graph expansion",
};

function ProvenanceChain({ item }: { item: ContextItem }) {
  const p = item.provenance;
  const parts: ReactNode[] = [
    <SourceBadge key="s" source={p.sourceKind} />,
    <span key="d" className="truncate text-fg-2" title={p.documentId}>
      {p.documentTitle}
    </span>,
    <span key="c" className="font-mono text-muted">
      chunk {p.chunkIndex}
    </span>,
    <Badge key="m" tone={p.method === "graph-expansion" ? "violet" : p.method === "exact-match" ? "info" : "neutral"}>
      {METHOD_LABEL[p.method]} · {p.retrievalScore}
    </Badge>,
  ];
  if (p.rerankScore != null)
    parts.push(
      <Badge key="r" tone="accent">
        reranked #{p.rank} · {p.rerankScore}
      </Badge>,
    );
  if (p.graphPath?.length)
    parts.push(
      <span key="g" className="text-violet">
        via {[...new Set(p.graphPath.map((g) => g.entity))].join(", ")}
      </span>,
    );
  parts.push(
    <span key="v" className="font-mono text-muted">
      {p.planId === "baseline" ? "baseline" : `plan v${p.planVersion}`}
    </span>,
  );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 text-[11px]">
      {parts.map((x, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted" />}
          {x}
        </span>
      ))}
    </div>
  );
}

function Column({
  title,
  strategy,
  items,
  trace,
  tokens,
  latency,
  cost,
  facts,
  hits,
  emphasis,
  degradations,
}: {
  title: ReactNode;
  strategy: string[];
  items: ContextItem[];
  trace: TraceStep[];
  tokens: number;
  latency: number;
  cost: number;
  facts?: string[];
  hits?: boolean[];
  emphasis?: boolean;
  degradations?: string[];
}) {
  const found = hits?.filter(Boolean).length ?? 0;
  return (
    <section className={clsx("flex min-w-0 flex-col rounded-xl border bg-surface shadow-card", emphasis ? "border-accent" : "border-line")}>
      <header className="space-y-3 border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {facts && hits && (
            <Badge tone={found === facts.length ? "accent" : "danger"}>
              {found === facts.length ? <Check className="size-3" /> : <X className="size-3" />} {found}/{facts.length} evidence
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {strategy.map((s) => (
            <span key={s} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
              {s}
            </span>
          ))}
        </div>
        <div className="tnum flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            <b className="font-semibold text-fg">{fmt.tokens(tokens)}</b> tokens
          </span>
          <span>
            <b className="font-semibold text-fg">{fmt.ms(latency)}</b>
            <Basis kind="measured" />
          </span>
          <span>
            <b className="font-semibold text-fg">{fmt.usd(cost)}</b>
            <Basis kind="estimated" />
          </span>
        </div>
        {facts && hits && (
          <ul className="space-y-1">
            {facts.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                {hits[i] ? <Check className="mt-0.5 size-3.5 shrink-0 text-accent" /> : <X className="mt-0.5 size-3.5 shrink-0 text-danger" />}
                <span className={clsx("font-mono", hits[i] ? "text-fg-2" : "text-danger")}>{f}</span>
              </li>
            ))}
          </ul>
        )}
        {degradations?.map((d) => (
          <p key={d} className="text-xs text-warn">
            {d}
          </p>
        ))}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-fg">Retrieval trace</summary>
          <ol className="mt-2 space-y-1">
            {trace.map((t, i) => (
              <li key={i} className="grid grid-cols-[110px_1fr_auto] gap-2">
                <span className="font-medium text-fg-2">{t.step}</span>
                <span className="min-w-0 break-words text-muted">{t.detail}</span>
                <span className="tnum text-muted">{t.ms ? fmt.ms(t.ms) : ""}</span>
              </li>
            ))}
          </ol>
        </details>
      </header>
      <ol className="divide-y divide-line">
        {items.map((c, i) => (
          <li key={c.provenance.chunkId + i} className="space-y-1.5 px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="tnum mt-0.5 text-[11px] text-muted">#{i + 1}</span>
              <ProvenanceChain item={c} />
              <span className="tnum ml-auto shrink-0 text-[11px] text-muted">{c.tokens} tok</span>
            </div>
            <p className="line-clamp-6 whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-fg-2">{highlight(c.text, facts ?? [])}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function PlaygroundPage() {
  const { data: ws } = useWorkspace();
  const { data: questions } = useJson<EvalQuestion[]>("/api/evals");
  const [q, setQ] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [res, setRes] = useState<PlaygroundResult>();

  // Examples come from the held-out set: questions the deployed plans never saw during optimization.
  const examples = useMemo(() => (questions ?? []).filter((x) => x.split === "validation").slice(0, 6), [questions]);

  const ask = async (question: string) => {
    setQ(question);
    setBusy(true);
    setErr(undefined);
    try {
      setRes(await postJson("/api/playground", { query: question, ...(maxTokens.trim() ? { constraints: { maxTokens: Number(maxTokens) } } : {}) }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Shareable links: /playground?q=… runs the query on load.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) ask(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = res?.deployed;
  return (
    <>
      <PageHeader
        title="Playground"
        description="See exactly what context an LLM would receive: typical retrieval next to the deployed ContextPlan, with the full retrieval trace and provenance for every item."
      />

      <Card className="mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) ask(q.trim());
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Which deploy caused the checkout latency regression, and who approved it?"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
          />
          <input
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            placeholder="max tokens"
            inputMode="numeric"
            aria-label="Max tokens"
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm text-fg outline-none placeholder:text-muted focus:border-accent sm:w-32"
          />
          <Button variant="primary" loading={busy} disabled={!q.trim()} className="h-10" icon={CornerDownLeft}>
            Assemble context
          </Button>
        </form>
        {examples.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] text-muted">Held-out examples (never used during optimization):</div>
            <div className="flex flex-wrap gap-1.5">
              {examples.map((x) => (
                <button
                  key={x.id}
                  onClick={() => ask(x.question)}
                  className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-left text-xs text-fg-2 hover:border-line-strong hover:text-fg"
                >
                  {x.question}
                </button>
              ))}
            </div>
          </div>
        )}
        {ws && !ws.deployed && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-warn">
            <Info className="size-3.5" /> No plan set is deployed, so only typical retrieval is shown.
            <Link href="/plans" className="inline-flex items-center gap-0.5 font-medium underline">
              Deploy one <ArrowRight className="size-3" />
            </Link>
          </p>
        )}
        {err && <p className="mt-3 text-xs text-danger">{err}</p>}
      </Card>

      {res && (
        <>
          {d && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-xs text-muted">
              <span className="font-medium text-fg">Router {d.router.version}:</span>
              <Badge tone="accent">{classLabelOf(ws, d.router.class)}</Badge>
              <span>confidence {d.router.confidence.toFixed(2)}</span>
              <span>· signals: {d.router.signals.join(", ")}</span>
              <span>
                → plan <span className="font-mono">{d.plan.id}</span> (v{d.plan.version})
              </span>
              {d.plan.fallbackUsed && <Badge tone="warn">fallback plan</Badge>}
              {res.evidence && (
                <span className="ml-auto">
                  {res.evidence.questionId} · {res.evidence.split === "validation" ? "held-out question" : "optimization question"}
                </span>
              )}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Column
              title="Typical retrieval"
              strategy={res.baseline.strategy}
              items={res.baseline.context}
              trace={res.baseline.trace}
              tokens={res.baseline.metrics.contextTokens}
              latency={res.baseline.metrics.measuredLatencyMs}
              cost={res.baseline.metrics.estimatedCostUsd}
              facts={res.evidence?.facts}
              hits={res.evidence?.baseline.hits}
            />
            {d && (
              <Column
                title={`RadarDB · ${d.plan.classLabel} plan v${d.plan.version}`}
                strategy={d.plan.strategy}
                items={d.context}
                trace={d.trace.steps}
                tokens={d.metrics.contextTokens}
                latency={d.metrics.measuredLatencyMs}
                cost={d.metrics.estimatedCostUsd}
                facts={res.evidence?.facts}
                hits={res.evidence?.deployed?.hits}
                degradations={d.trace.degradations}
                emphasis
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
