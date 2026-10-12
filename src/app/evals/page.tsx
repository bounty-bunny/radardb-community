"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Trash, X } from "lucide-react";
import type { EvalQuestion, IntegrityReport, OptimizerRun, RouteDecision } from "@/core/domain";
import { Badge, Button, Card, PageHeader, Segmented, Spinner } from "@/components/ui";
import { IntegrityPanel } from "@/components/integrity";
import { classLabelOf, useWorkspace } from "@/components/workspace";
import { postJson, useJson } from "@/lib/client";

type Q = EvalQuestion & { routed: RouteDecision };

function AddQuestion({ onDone }: { onDone: () => void }) {
  const [question, setQuestion] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <Card title="Add a question" description="Use a real question and the exact phrases, copied from the source, that a correct answer must be grounded in." className="mb-6">
      <div className="space-y-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why did checkout latency spike on September 14?"
          className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
        />
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          rows={3}
          placeholder={"Required evidence, one phrase per line\nloaded promotion rules once per cart line"}
          className="w-full rounded-lg border border-line-strong bg-surface p-3 font-mono text-xs text-fg outline-none placeholder:text-muted focus:border-accent"
        />
        <p className="text-xs text-muted">The split (optimization or held-out) is assigned once from the question id and never changes.</p>
        <div className="flex items-center justify-end gap-2">
          {err && <span className="mr-auto text-xs text-danger">{err}</span>}
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!question.trim() || !evidence.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await postJson("/api/evals", {
                  question,
                  requiredEvidence: evidence
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                onDone();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add question
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Mark({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) return <span className="text-muted">·</span>;
  return ok ? <Check className="mx-auto size-4 text-accent" /> : <X className="mx-auto size-4 text-danger" />;
}

export default function EvalsPage() {
  const { data: ws } = useWorkspace();
  const { data: questions, refresh } = useJson<Q[]>("/api/evals");
  const { data: integrity, refresh: refreshIntegrity } = useJson<IntegrityReport>("/api/integrity");
  const runId = ws?.lastRun?.id;
  const { data: run } = useJson<OptimizerRun>(runId ? `/api/runs/${runId}` : null);
  const [adding, setAdding] = useState(false);
  const [split, setSplit] = useState<"all" | "optimization" | "validation">("all");
  const outcome = useMemo(() => new Map((run?.validationResults ?? []).map((r) => [r.questionId, r])), [run]);

  if (!ws || !questions) return <Spinner className="mt-20 size-6" />;
  const shown = questions.filter((q) => split === "all" || q.split === split);
  const reload = async () => {
    await refresh();
    await refreshIntegrity();
  };

  return (
    <>
      <PageHeader
        title="Eval set"
        description="The questions your team asks and the evidence that answers them. Optimization questions drive selection; held-out questions only measure it."
        actions={
          <Button icon={Plus} variant="primary" onClick={() => setAdding(true)}>
            Add question
          </Button>
        }
      />
      {adding && <AddQuestion onDone={() => (setAdding(false), reload())} />}

      {integrity && (
        <Card title="Evaluation integrity" className="mb-6">
          <IntegrityPanel report={integrity} />
        </Card>
      )}

      <Card
        title={`Questions · ${shown.length}`}
        description="Class = label; routed = what router rules-v1 decides at serve time. Held-out outcomes are from the latest run (all evidence retrieved?)."
        actions={
          <Segmented
            value={split}
            onChange={setSplit}
            options={[
              { value: "all", label: "All" },
              { value: "optimization", label: "Optimization" },
              { value: "validation", label: "Held-out" },
            ]}
          />
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pl-5 pr-3 font-medium">Question</th>
                <th className="px-3 font-medium">Required evidence</th>
                <th className="px-2 text-center font-medium">Typical</th>
                <th className="px-2 text-center font-medium">RadarDB</th>
                <th className="pl-2 pr-5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => {
                const o = outcome.get(q.id);
                return (
                  <tr key={q.id} className="border-t border-line align-top">
                    <td className="py-3 pl-5 pr-3">
                      <div className="text-sm text-fg">{q.question}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] text-muted">{q.id}</span>
                        <Badge tone={q.split === "validation" ? "violet" : "neutral"}>{q.split === "validation" ? "held-out" : "optimization"}</Badge>
                        <Badge>{classLabelOf(ws, q.questionClass)}</Badge>
                        {q.routed.class !== q.questionClass && <Badge tone="warn">routed: {classLabelOf(ws, q.routed.class)}</Badge>}
                        <span className="text-[11px] text-muted">
                          {q.provenance} · {q.humanVerified ? "human-verified" : "not human-verified"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-md flex-wrap gap-1">
                        {q.requiredEvidence.map((f, i) => (
                          <span key={i} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
                            {Array.isArray(f) ? f.join("  |  ") : f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Mark ok={o?.baseline.success} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Mark ok={o?.plan.success} />
                    </td>
                    <td className="py-3 pl-2 pr-5 text-right">
                      <button
                        aria-label="Delete question"
                        onClick={async () => {
                          await fetch(`/api/evals?id=${q.id}`, { method: "DELETE" });
                          reload();
                        }}
                        className="grid size-7 place-items-center rounded text-muted hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
