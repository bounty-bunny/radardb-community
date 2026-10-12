"use client";

import clsx from "clsx";
import { ArrowRight, Database, Gauge, Layers, RotateCcw, Search, Sparkles, type LucideIcon } from "lucide-react";
import type { PlanConfig } from "@/core/domain";
import { CHUNKING_LABEL, EMBEDDING_LABEL, RERANKER_LABEL, RETRIEVAL_LABEL } from "@/engine/labels";

const FLOW: { label: string; body: string; icon: LucideIcon }[] = [
  { label: "Data", body: "Connect existing sources; nothing is migrated", icon: Database },
  { label: "Represent", body: "Chunkings, BM25, vectors, entity graph", icon: Layers },
  { label: "Retrieve", body: "Route each question to a ContextPlan", icon: Search },
  { label: "Measure", body: "Evidence coverage, precision, tokens, latency", icon: Gauge },
  { label: "Learn", body: "Select and validate plans per workload", icon: Sparkles },
];

/** DATA → REPRESENT → RETRIEVE → MEASURE → LEARN ↺ */
export function HowItWorks({ active }: { active?: number }) {
  return (
    <div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {FLOW.map((s, i) => (
          <li
            key={s.label}
            className={clsx("relative rounded-lg border p-3 transition-colors", active === i ? "border-accent bg-accent-soft" : "border-line bg-surface")}
          >
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-md bg-surface-2 text-fg-2">
                <s.icon className="size-3.5" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-fg">{s.label}</span>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-muted">{s.body}</p>
            {i < FLOW.length - 1 && (
              <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden size-3.5 -translate-y-1/2 rounded-full bg-bg text-muted lg:block" />
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-col items-center gap-1 text-center text-xs text-muted sm:flex-row sm:justify-between sm:text-left">
        <span className="flex items-center gap-1.5">
          <RotateCcw className="size-3" /> Re-represent and re-validate when data or questions change
        </span>
        <span className="font-medium text-fg-2">RadarDB supplies optimized context. Your application chooses the LLM.</span>
      </div>
    </div>
  );
}

function Step({ title, value, muted }: { title: string; value: string; muted?: boolean }) {
  return (
    <div className={clsx("min-w-0 flex-1 rounded-lg border px-2.5 py-2", muted ? "border-dashed border-line bg-transparent" : "border-line bg-surface")}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted">{title}</div>
      <div className={clsx("truncate text-xs font-medium", muted ? "text-muted" : "text-fg")} title={value}>
        {value}
      </div>
    </div>
  );
}

/** A ContextPlan rendered as the steps it executes. */
export function PipelineFlow({ config }: { config: PlanConfig }) {
  const retrieve =
    RETRIEVAL_LABEL[config.retrievalStrategy] +
    (config.embeddingModel && config.retrievalStrategy !== "lexical" ? ` · ${EMBEDDING_LABEL[config.embeddingModel]}` : "") +
    (config.exactMatchBoost ? " · exact-ID" : "");
  const steps = [
    { title: "Represent", value: CHUNKING_LABEL[config.chunkingStrategy] },
    { title: "Retrieve", value: retrieve },
    { title: "Rerank", value: RERANKER_LABEL[config.reranker], muted: config.reranker === "none" },
    { title: "Graph", value: config.graphStrategy === "none" ? "None" : "Entity expansion", muted: config.graphStrategy === "none" },
    { title: "Assemble", value: `top-${config.topK} · dedupe` },
  ];
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
      {steps.map((s, i) => (
        <div key={s.title} className="flex min-w-0 flex-1 items-center gap-1.5">
          <Step {...s} />
          {i < steps.length - 1 && <ArrowRight className="hidden size-3 shrink-0 text-muted sm:block" />}
        </div>
      ))}
    </div>
  );
}
