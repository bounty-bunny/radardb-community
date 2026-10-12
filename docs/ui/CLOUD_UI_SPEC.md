# Cloud UI specification (PLANNED, not built)

The hosted console reuses the community pages, with the same components and data contracts, and adds workspace, connection, history, scheduling and billing surfaces. **None of this exists.** The community UI must not show these screens or locked versions of them.

## Information architecture

```
Org switcher ▾  │ Workspaces │ Connections │ Evaluations │ Schedules │ Alerts │ Usage & billing │ Settings
                └── inside a workspace: Overview · Sources · Eval set · Optimizer · Context plans · Benchmark · Playground · API   (community pages)
```

## Screens

### 1. Onboarding: create a workspace

```
┌ Create workspace ──────────────────────────────────────────────┐
│ Name [ Support assistant          ]                            │
│ Start from:  (•) Upload export   ( ) Connect source   ( ) Import plan release (.json) │
│ Region [ eu-west ▾ ]    Data retention [ 90 days ▾ ]           │
│                                     [ Cancel ] [ Create ]      │
└────────────────────────────────────────────────────────────────┘
```

- "Import plan release" accepts `radardb.plan-release` v1 (validated with the same `parsePortableRelease`). This is the local-to-cloud path.
- States: validating (spinner + file name), invalid (the list of `errors[]` from the validator), created → redirect to Overview.

### 2. Connections (managed connectors)

| Column | Notes |
|---|---|
| Connector | Confluence, Zendesk, SharePoint, GitHub, Files |
| Status | Connected / Syncing (progress) / Error (message + retry) / Paused |
| Last sync, documents, size | from the sync service |
| Credentials | "Managed (vault)", never displayed; rotate / revoke |

Empty state: "No connections yet. Upload an export or connect a source." with both actions.

### 3. Evaluations (history)

A table of runs: date, trigger (manual / schedule / drift), dataset version, plan release, held-out Recall@k with CI, tokens, p95 latency, status.

- Row → run detail: the community Optimizer view, read-only.
- Compare two runs side by side (Δ with CI).
- Filters: workspace, trigger, date range.

### 4. Recommendations

A card per candidate improvement, for example: "Fusion with section/hybrid partner: +4.1 Recall@5 [1.2, 7.0] on held-out, +110 ms p50". Actions: **Shadow test** → **Deploy** (approval-gated) / **Dismiss**. Evidence is always shown as a point estimate with CI. There are no "AI recommends" claims without numbers.

### 5. Schedules and alerts

- Schedule: cron-style picker (daily / weekly), objective, question set, auto-deploy toggle (off by default; requires a policy).
- Alert rules: "held-out Recall@k drops > X points", "p95 latency > Y ms", "sync failing > Z h". Channels: email, webhook.
- Alert list: open / acknowledged / resolved, each linked to the evaluation that fired it.

### 6. Usage and billing

Usage meters: documents indexed, evaluation compute minutes, API requests, storage. The same numbers feed billing. Plan, invoices, payment method (provider-hosted form). Upgrade flows are only shown to admins and never interrupt evaluation work.

## Cross-cutting requirements

Accessible (keyboard, focus rings, WCAG 2.1 AA contrast); responsive; every async view has loading, empty and error states; metrics show measured vs estimated; no fabricated data in demos; feature availability is driven by the org's actual entitlements, and nothing is hidden behind fake locks.
