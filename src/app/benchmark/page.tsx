"use client";

import { useState } from "react";
import clsx from "clsx";
import { Database, Download, Gauge, Play } from "lucide-react";
import type { Benchmark, Objective } from "@/core/domain";
import { Badge, Button, Card, ConfigChips, Empty, PageHeader, Segmented, Spinner } from "@/components/ui";
import { RunProgress } from "@/components/run-controls";
import { IntegrityPanel } from "@/components/integrity";
import { ComparisonTable, metricRows } from "@/components/plan-ui";
import { useWorkspace } from "@/components/workspace";
import { fmt, postJson, useJson } from "@/lib/client";

const EXAMPLE = `[
  { "question": "Who approved deploy DEP-1187?",
    "requiredEvidence": ["Daniel Kim | Priya Nair | rolled back"] },
  { "question": "How do I roll back a service?",
    "requiredEvidence": [["deployctl rollback", "roll back with deployctl"]] }
]`;

async function readFiles(files: FileList | null): Promise<{ title: string; content: string; path: string }[]> {
  if (!files) return [];
  const out = [];
  for (const f of Array.from(files)) {
    if (!/\.(md|markdown|txt)$/i.test(f.name)) continue;
    const content = await f.text();
    const h = /^#\s+(.+)$/m.exec(content);
    out.push({ title: (h ? h[1] : f.name.replace(/\.[^.]+$/, "")).slice(0, 200), content, path: f.webkitRelativePath || f.name });
  }
  return out;
}

function NewBenchmark({ onStarted }: { onStarted: (id: string) => void }) {
  const { refresh, data: ws } = useWorkspace();
  const [name, setName] = useState("");
  const [docs, setDocs] = useState<{ title: string; content: string; path: string }[]>([]);
  const [questions, setQuestions] = useState("");
  const [objective, setObjective] = useState<Objective>("balanced");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const start = async (body: unknown) => {
    setBusy(true);
    setErr(undefined);
    try {
      const b = await postJson<Benchmark>("/api/benchmarks", body);
      await refresh();
      onStarted(b.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="New benchmark" description="Your documents + 30–100 representative questions with the evidence that answers them. Nothing is deployed and this workspace is not changed.">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Benchmark name, e.g. Acme support KB"
            className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
          />
          <label className="block rounded-lg border border-dashed border-line-strong p-4 text-center text-sm text-muted hover:border-accent">
            <input type="file" multiple accept=".md,.markdown,.txt" className="sr-only" onChange={async (e) => setDocs(await readFiles(e.target.files))} />
            {docs.length ? (
              <span className="text-fg">
                {docs.length} documents · {fmt.tokens(docs.reduce((s, d) => s + d.content.length / 4, 0))} tokens
              </span>
            ) : (
              <>Choose Markdown / text files</>
            )}
          </label>
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted">Objective</div>
            <Segmented
              value={objective}
              onChange={setObjective}
              options={[
                { value: "balanced", label: "Balanced" },
                { value: "quality", label: "Max quality" },
                { value: "cost", label: "Lowest cost" },
                { value: "latency", label: "Lowest latency" },
              ]}
            />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-muted">Questions (JSON)</span>
            <button className="text-accent hover:underline" onClick={() => setQuestions(EXAMPLE)}>
              Insert example
            </button>
          </div>
          <textarea
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            rows={9}
            placeholder={EXAMPLE}
            className="w-full rounded-lg border border-line-strong bg-surface p-3 font-mono text-[11px] text-fg outline-none placeholder:text-muted focus:border-accent"
          />
          <p className="text-[11px] text-muted">
            requiredEvidence: exact phrases from the documents; an inner array means &quot;any of these&quot;. Questions without evidence are reported but not scored. 25% are held out
            automatically unless you set &quot;split&quot;.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={Play}
          loading={busy}
          disabled={!docs.length || !questions.trim()}
          onClick={() => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(questions);
            } catch {
              setErr("questions must be valid JSON");
              return;
            }
            start({ name, objective, documents: docs, questions: parsed });
          }}
        >
          Run benchmark
        </Button>
        <Button icon={Database} loading={busy} onClick={() => start({ name: "", objective, fromWorkspace: true })}>
          Benchmark this workspace&apos;s data
        </Button>
        {ws?.sources.some((s) => s.synthetic) && <span className="text-xs text-muted">(the demo workspace is synthetic)</span>}
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </Card>
  );
}

function Report({ b }: { b: Benchmark }) {
  const r = b.report!;
  return (
    <div className="space-y-6">
      <div className="tnum flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span>{r.documents} documents</span>
        <span>
          {r.questions.optimization} optimization · {r.questions.validation} held-out · {r.questions.unscored} unscored
        </span>
        <span>{r.configurationsTested} configurations</span>
        <span>objective {r.objective}</span>
        <a href={`/api/benchmarks/${b.id}?format=md`} className="ml-auto inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <Download className="size-3.5" /> Markdown report
        </a>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
          Held-out validation <Badge tone="accent">never used for selection</Badge>
        </h3>
        {r.validation.radar.n ? (
          <ComparisonTable
            rows={metricRows(r.validation.baseline, r.validation.radar, { typical: r.validation.baselineMeasuredLatency, radar: r.validation.measuredLatency })}
          />
        ) : (
          <p className="text-sm text-muted">No held-out questions. Add more questions so 25% can be held out.</p>
        )}
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
          Optimization set <Badge tone="warn">optimistic</Badge>
        </h3>
        <ComparisonTable rows={metricRows(r.optimization.baseline, r.optimization.radar)} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg">By question class</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {r.perClass.map((c) => (
            <div key={c.questionClass} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-fg">{c.label}</span>
                <span className="tnum text-xs text-muted">
                  {c.optimizationQuestions} opt ·{" "}
                  {c.validation ? (
                    <>
                      held-out {fmt.pct(c.validation.baseline.evidenceCoverage, 0)} → <b className="text-accent">{fmt.pct(c.validation.radar.evidenceCoverage, 0)}</b> (n={c.validation.radar.n})
                    </>
                  ) : (
                    "no held-out"
                  )}
                </span>
              </div>
              <ConfigChips config={c.plan} className="mt-2" />
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted">
                {c.reasons.slice(1, 3).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg">Evaluation integrity</h3>
        <IntegrityPanel report={r.integrity} />
      </div>
    </div>
  );
}

export default function BenchmarkPage() {
  const { data: list } = useJson<Benchmark[]>("/api/benchmarks", { pollMs: (d) => (d?.some((b) => b.status === "running") ? 1500 : null) });
  const [selected, setSelected] = useState<string | null>(null);
  const shown = list?.find((b) => b.id === selected) ?? list?.[0];

  return (
    <>
      <PageHeader
        title="Context Benchmark"
        description="Measure RadarDB on a design partner's own data before anyone deploys anything: typical retrieval vs RadarDB, broken down by question class, with held-out validation."
      />
      <div className="mb-6">
        <NewBenchmark onStarted={setSelected} />
      </div>
      {!list ? (
        <Spinner />
      ) : !list.length ? (
        <Card>
          <Empty icon={Gauge} title="No benchmarks yet" body="Run one on uploaded files, on this workspace's data, or from the CLI: npm run benchmark -- <folder> <questions.json>" />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          <Card title="Benchmarks" bodyClassName="p-0" className="lg:col-span-1">
            <ul className="divide-y divide-line">
              {list.map((b) => (
                <li key={b.id}>
                  <button onClick={() => setSelected(b.id)} className={clsx("w-full px-4 py-3 text-left hover:bg-surface-2", shown?.id === b.id && "bg-surface-2")}>
                    <div className="truncate text-sm font-medium text-fg">{b.name}</div>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <Badge tone={b.status === "completed" ? "accent" : b.status === "failed" ? "danger" : "info"}>{b.status}</Badge>
                      {fmt.rel(b.createdAt)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={shown?.name ?? ""} className="lg:col-span-3">
            {shown?.status === "running" && <RunProgress progress={shown.progress} note={false} />}
            {shown?.status === "failed" && <p className="text-sm text-danger">{shown.error}</p>}
            {shown?.status === "completed" && shown.report && <Report b={shown} />}
          </Card>
        </div>
      )}
    </>
  );
}
