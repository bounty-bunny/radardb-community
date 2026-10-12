# ADR 0003: The public engine boundary

- **Status:** Accepted (2026-10-11)
- **Date:** 2026-10-11

## Decision

`src/engine/index.ts` is the supported public API. It has two tiers:

- **STABLE:** domain types, versioned schemas, chunkers, indexes, retrievers, rerankers, assembler, executor, evaluation, optimizer, router, cost model, experiment manifest. The export list is pinned by `tests/api-surface.test.ts`, and any change needs a CHANGELOG entry.
- **EXPERIMENTAL:** the `experimental` namespace: `fusion` (FusionContextPlan), `objective` (V1.1 global-plan objective), `portfolio`. It may change in any release.

The failed V1.1A learned selector is deliberately **not** exported and is not part of this repository.

Import rules (test-enforced): core/engine never import server, UI, Next.js, validation or research; app and scripts never import validation or research.

## Rationale

The layering already existed. Making it explicit gives the commercial platform and third parties one surface to depend on, and lets internal modules move (for example into npm workspaces, ADR 0001) without breaking users. Separating experimental items keeps the validated-but-young fusion code available without promising stability.

## Consequences

Deep imports keep working but are unsupported. 0.x minor releases may still break the stable tier, with a CHANGELOG note.
