# ADR 0001: Repository strategy for open source and commercial code

- **Status:** Accepted (2026-10-11)
- **Date:** 2026-10-11

## Context

RadarDB is one Next.js application. The engine (`src/core`, `src/engine`) is already independent of the server and UI, and this is enforced by a test. No commercial code exists yet: hosting, tenancy, billing, SSO, and managed optimization are all planned. Git history contains private research, business plans, and personal author emails.

## Options

| | A. One public monorepo, commercial code in the same repo (open core with closed directories) | B. Public repository + separate private commercial repository consuming versioned packages | C. Publish only npm packages (engine), keep the app private |
|---|---|---|---|
| Leak risk | **High**: private code one bad merge, build artifact, or source map away from public | Low: private code never enters the public repo | Low, but the app is the product users try |
| Community value | Full | Full | Poor: no UI or local server for evaluation |
| Engine duplication | none | none, if the commercial repo depends on published packages | none |
| Build complexity | conditional builds and licensing per directory | two CI pipelines; version pinning | packaging only |
| Fit with today's code | poor (mixed licensing in one tree) | good: engine boundary already exists | loses most user value |

## Decision

**B.** A public `radardb` repository containing the engine, local server, community UI, CLI, schemas, tests and docs, started from a **fresh history** (ADR 0006), plus a separate private repository for commercial services that depends on versioned public artifacts.

Incremental path, with no big-bang restructure:

1. **Now:** keep the single app; treat `src/engine/index.ts` + `schemas/` + `/api/v1/*` as the public contract (done, test-pinned).
2. **Next:** convert to npm workspaces: `packages/engine` (`src/core` + `src/engine`), `packages/cli`, `apps/community` (the Next.js app). Move files with `git mv`; keep `@/` aliases during migration.
3. **Then:** publish `@radardb/engine` (after license approval). The commercial repo pins it by SemVer and consumes the HTTP and file contracts. It never uses deep imports.

The suggested `packages/{core,retrieval,evaluation,optimizer,sdk,cli}` split is **rejected for now**: those modules are small and tightly coupled (the optimizer calls the executor, which calls retrievers). Splitting them would add version-skew risk without a consumer that needs it. Revisit when a second consumer exists.

## Consequences

- Private code is separated by repository, not by convention.
- Workspaces migration (step 2) is a mechanical refactor with its own PR and test run.
- Validation and research evidence stays in the private history unless separately approved for release.
