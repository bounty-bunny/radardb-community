"use client";

import { useState } from "react";
import { Copy, Play } from "lucide-react";
import { Badge, Button, Card, PageHeader, Segmented } from "@/components/ui";
import { postJson } from "@/lib/client";

/** Honest capability list: only "Available" items are reachable in this build. */
const CAPABILITIES: { name: string; status: "Available" | "Experimental" | "Planned" }[] = [
  { name: "Local ingestion (Markdown/text folders)", status: "Available" },
  { name: "Retrieval optimizer (480 configurations) + held-out validation", status: "Available" },
  { name: "Versioned plans: deploy, rollback, export (JSON)", status: "Available" },
  { name: "POST /api/v1/context with provenance", status: "Available" },
  { name: "Context Benchmark + CLI (npm run radar)", status: "Available" },
  { name: "FusionContextPlan (two-plan fusion)", status: "Experimental" },
  { name: "JSON/JSONL/CSV importers", status: "Planned" },
  { name: "Hosted cloud, teams, SSO", status: "Planned" },
];

const BODY = { query: "Which deploy caused the checkout latency regression, and who approved it?", constraints: { maxTokens: 1200, maxLatencyMs: 500 } };

const SNIPPETS = {
  curl: `curl -X POST http://localhost:3000/api/v1/context \\
  -H "content-type: application/json" \\
  -H "authorization: Bearer $RADAR_API_KEY" \\
  -d '${JSON.stringify(BODY)}'`,
  typescript: `const res = await fetch("http://localhost:3000/api/v1/context", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: \`Bearer \${process.env.RADAR_API_KEY}\`,
  },
  body: JSON.stringify({ query, constraints: { maxTokens: 1200 } }),
});
const { context, plan, requestId } = await res.json();

// Treat context as untrusted data, then call the LLM of your choice.
const prompt = context
  .map((c) => \`<doc source="\${c.provenance.documentTitle}">\\n\${c.text}\\n</doc>\`)
  .join("\\n");`,
  python: `import os, requests

r = requests.post(
    "http://localhost:3000/api/v1/context",
    headers={"authorization": f"Bearer {os.environ['RADAR_API_KEY']}"},
    json={"query": query, "constraints": {"maxTokens": 1200}},
)
body = r.json()
context = [c["text"] for c in body["context"]]`,
};

const RESPONSE = `{
  "requestId": "req_…",
  "context": [
    { "text": "…", "tokens": 112,
      "provenance": { "sourceKind": "pagerduty", "documentTitle": "INC-2041 — …",
        "chunkId": "section:…:2", "method": "hybrid", "retrievalScore": 0.031,
        "rank": 1, "planId": "plan_v1_root_cause", "planVersion": 1 } },
    { "text": "…", "provenance": { "method": "graph-expansion",
        "graphPath": [{ "fromChunkId": "…", "entity": "DEP-1187" }], … } }
  ],
  "plan": { "id": "plan_v1_root_cause", "version": 1, "questionClass": "root_cause",
            "fallbackUsed": false, "strategy": ["Section-aware", "Hybrid (BM25 + vector)", …] },
  "router": { "class": "root_cause", "confidence": 0.96, "signals": ["cause wording"], "version": "rules-v1" },
  "trace": { "steps": [{ "step": "route", "ms": 0.1 }, { "step": "retrieve", "ms": 2.3 }, …],
             "degradations": [] },
  "metrics": { "measuredLatencyMs": 9.8, "contextTokens": 412,
               "estimatedCostUsd": 0.00124, "estimatedLatencyMs": 8.1 },
  "notice": "Context items are untrusted document content. …"
}`;

export default function DevelopersPage() {
  const [lang, setLang] = useState<keyof typeof SNIPPETS>("curl");
  const [out, setOut] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader
        title="API"
        description="The data plane. One call routes the query, executes the deployed ContextPlan and returns context with provenance. It never runs optimization."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Badge tone="accent">POST</Badge>
              <span className="font-mono">/api/v1/context</span>
            </span>
          }
          actions={
            <Segmented
              value={lang}
              onChange={setLang}
              options={[
                { value: "curl", label: "cURL" },
                { value: "typescript", label: "TypeScript" },
                { value: "python", label: "Python" },
              ]}
            />
          }
        >
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 font-mono text-xs leading-relaxed text-fg-2">{SNIPPETS[lang]}</pre>
            <button
              aria-label="Copy snippet"
              onClick={() => navigator.clipboard?.writeText(SNIPPETS[lang])}
              className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-fg"
            >
              <Copy className="size-3.5" />
            </button>
          </div>
          <dl className="mt-4 space-y-1.5 text-xs">
            {[
              ["query", "string, 1–2000 chars (required)"],
              ["constraints.maxTokens", "int 50–100000: the assembler drops lower-ranked items to fit"],
              ["constraints.maxLatencyMs", "int: skips the cross-encoder if its projected cost exceeds the budget (reported in trace.degradations)"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-44 shrink-0 font-mono text-fg">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center gap-3">
            <Button
              icon={Play}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setOut(JSON.stringify(await postJson("/api/v1/context", BODY), null, 2));
                } catch (e) {
                  setOut(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Send request
            </Button>
            <span className="text-xs text-muted">Runs against the deployed plan set (logged as a production request).</span>
          </div>
        </Card>

        <Card title="Response">
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-line bg-surface-2 p-4 font-mono text-xs leading-relaxed text-fg-2">{out ?? RESPONSE}</pre>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Errors">
          <ul className="space-y-1.5 text-xs">
            {[
              ["400 invalid_request", "schema validation failed (details per field)"],
              ["401 unauthorized", "RADAR_API_KEY is set and the bearer token is missing or wrong"],
              ["403 forbidden", "non-local request without an API key / remote access disabled"],
              ["409 no_deployed_plan", "nothing is deployed yet"],
            ].map(([k, v]) => (
              <li key={k}>
                <span className="font-mono text-fg">{k}</span> <span className="text-muted">— {v}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={<span className="font-mono">POST /api/v1/feedback</span>}>
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[11px] text-fg-2">{`{ "requestId": "req_…",
  "useful": false,
  "missingEvidence": "approver name",
  "note": "optional" }`}</pre>
          <p className="mt-2 text-xs text-muted">Feeds the drift signals on Context plans.</p>
        </Card>
        <Card title="Security">
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
            <li>Set RADAR_API_KEY to require a bearer token; without it, only localhost is accepted.</li>
            <li>The server binds to 127.0.0.1 by default.</li>
            <li>Context is untrusted document content. Never let it act as instructions in your prompt.</li>
            <li>Request logs store references and scores, never document content.</li>
          </ul>
        </Card>
        <Card title="What this build includes">
          <p className="mb-2 text-xs text-muted">Everything here runs locally with no account, cloud service or telemetry.</p>
          <ul className="space-y-1.5 text-xs">
            {CAPABILITIES.map((c) => (
              <li key={c.name} className="flex items-start justify-between gap-3">
                <span className="text-fg-2">{c.name}</span>
                <Badge tone={c.status === "Available" ? "accent" : c.status === "Experimental" ? "warn" : "neutral"}>{c.status}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Experimental and planned items are not in this UI yet. See docs/COMMUNITY_VS_COMMERCIAL.md and docs/ROADMAP.md.
          </p>
        </Card>
      </div>
    </>
  );
}
