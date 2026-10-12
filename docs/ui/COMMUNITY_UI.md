# Community UI (implemented)

The local console (`npm run dev`, http://127.0.0.1:3000) uses the existing design system in `src/components/ui.tsx`: Card, Badge (tones neutral/accent/warn/danger/info/violet), Button, PageHeader, Segmented, plus charts and diagrams. It supports dark and light themes, and responsive layouts from mobile to desktop (see `docs/screenshots/`).

| Page | What it does | Backed by |
|---|---|---|
| Overview | held-out typical vs selected plans, what was learned per class, "Why this plan?" | `/api/workspace`, `/api/runs` |
| Sources | connect a local folder (path-confined), upload, sync, browse documents | `/api/sources`, `/api/documents` |
| Eval set | questions with required evidence, splits, integrity report | `/api/evals`, `/api/integrity` |
| Optimizer | objective, strategy, constraints; progress; held-out vs optimization; Pareto; leaderboard | `/api/runs` |
| Context plans | versioned releases, deploy, rollback, router, drift, request log, **Export JSON** | `/api/plans*`, `/api/drift`, `/api/requests` |
| Benchmark | evaluate an uploaded corpus + questions without deploying; Markdown report | `/api/benchmarks` |
| Playground | typical vs deployed plan with full trace and provenance | `/api/playground` |
| API (Developers) | data-plane contract, snippets, errors, security, **capability panel** | static + `/api/v1/*` |

## Changes in this round

1. **Export JSON** (Context plans → release table → Actions). A plain link to `GET /api/plans/export?releaseId=…`, downloaded as `radardb-plan-release-v<N>.json`. It is keyboard reachable and has a tooltip (`title`). There is no client state, so it can't fail silently: errors come back as JSON with a status code.
2. **"What this build includes"** (API page). A list of capabilities with honest badges:
   - **Available** (accent): reachable in this build.
   - **Experimental** (warn): FusionContextPlan; engine only, not in the UI.
   - **Planned** (neutral): JSON/JSONL/CSV importers; hosted cloud, teams, SSO.

   There are no disabled "upgrade" buttons and no locked controls. Planned items are labeled text, not controls.

## Conventions kept

- Every number shown comes from a real run or a measurement. Estimated values say "est." and measured ones say "measured".
- Held-out and optimization results are never mixed in one figure (audit item C1).
- Loading, empty and error states follow the existing page patterns. They were not re-audited page by page in this round (see backlog).

## Known accessibility gaps (backlog)

- No automated accessibility check in CI (axe/Playwright not installed).
- Chart components rely on color plus labels; their table alternatives should be audited.
- Focus order on the Optimizer page has not been verified with a screen reader.
