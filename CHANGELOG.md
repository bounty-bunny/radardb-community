# Changelog

All notable changes to RadarDB. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/); before 1.0, minor versions may contain breaking changes.

## [Unreleased]

## [0.2.0] - 2026-10-12

First public release of the RadarDB community edition: a local-first context optimizer that searches 480 retrieval configurations for your documents and questions, validates the choice on held-out questions, and serves the result with provenance. No account, no telemetry, no license key.

### Highlights
- Every working engine capability is included: chunking, BM25 / dense / hybrid retrieval, cross-encoder reranking, optimizer with held-out validation, versioned plans with deploy and rollback, `/api/v1/context`, console, `radar` CLI, portable plan export.
- **FusionContextPlan (EXPERIMENTAL)**, a two-plan fusion at an equal token budget, is available in the engine API (`experimental.fusion`). It is not yet served by `/api/v1/context`, and its API may change.
- A five-minute [quick-start example](examples/quickstart/README.md) on a small synthetic corpus.
- A reproduction kit for the locked public-benchmark evaluations (EnterpriseRAG-Bench, WixQA): pinned, checksum-verified dataset download and a reproduction mode that never overwrites sealed results.

### Evidence (locked held-out tests; Recall@5, paired 95% CI; never pooled)
- WixQA, 120 held-out questions: per-question-type plans vs the best single configuration, +0.8 points [−1.7, +4.2]: **no significant gain**.
- EnterpriseRAG-Bench, 10K documents, 142 held-out questions: FusionContextPlan vs the best single configuration at the same token budget, 82.3% → 87.7%, **+5.4 points [+2.3, +9.1]**. Meeting the preregistered decision rule (≥ +5.0 with the CI excluding 0) does not establish that the true effect is at least 5 points.
- WixQA Synthetic, 4,000 new questions on the same corpus: 97.9% → 98.5%, **+0.7 [+0.4, +1.0]** (near ceiling).
- Results for one further benchmark are withheld until its redistribution terms are verified. The baseline is RadarDB's own best single configuration, not another product. Details: docs/BENCHMARK_REPRODUCIBILITY.md.

### Known limitations
Single user, localhost by default, no authentication; plain-JSON storage (about 250K cached vectors); model revisions are not pinned; CPU inference, where reranking adds latency. See docs/LIMITATIONS.md.

### Added
- Public engine API at `src/engine/index.ts` with an explicit STABLE surface and an `experimental` namespace (FusionContextPlan, V1.1 objective, portfolio). The export list is pinned by `tests/api-surface.test.ts`.
- Versioned runtime schemas (`src/core/schemas.ts`) for `PlanConfig`, `FusionPlanConfig` and the portable plan release format `radardb.plan-release` v1; generated JSON Schemas in `schemas/` (`npm run schemas`).
- Portable plan export/validation (`src/core/portable.ts`), including migration of the legacy `GET /api/plans` release shape.
- `GET /api/plans/export` (control plane) and an **Export JSON** action on the Plans page.
- Reproducible experiment manifest (`src/engine/manifest.ts`): dataset version, question-set hash, search-space hash, router, models.
- `radar` CLI (`npm run radar`): `doctor`, `context`, `plan export`, `plan validate`, `manifest`.
- Capability panel on the Developers page listing Available / Experimental / Planned features.
- Community files: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GOVERNANCE, NOTICE; issue/PR templates; CI and security workflows (not yet run on a public repository).
- Engine requirement declared: Node.js >= 20.9 (checked by `radar doctor`).
- Quick-start example (`examples/quickstart/`): a small fictional corpus with fixed splits; evidence is checked by `tests/quickstart.test.ts`.
- Benchmark reproducibility kit for EnterpriseRAG-Bench and WixQA: `validation/harness/fetch-datasets.ts` (pinned revisions, sha256-verified), reproduction mode (`RADAR_REPRODUCE=1`, writes `*.reproduced.json`, verifies the frozen engine against `validation/harness/frozen-manifest.json`), `research/v1.1/compare-reproduction.ts`.
- Regression tests guaranteeing that FusionContextPlan (EXPERIMENTAL) leaves the stable `executePlan` results unchanged.
- Docs: PILOT_GUIDE, BENCHMARK_PROTOCOL, LIMITATIONS, MAINTAINERS; DCO sign-off policy in CONTRIBUTING.
- License: Apache-2.0 (LICENSE, NOTICE); contributions under the DCO 1.1 (DCO, CONTRIBUTING.md).
- Third-party dataset notice (docs/DATASETS.md); CI with SHA-pinned actions, a DCO check and a quick-start smoke test; release workflow with SBOMs and build provenance.

### Unchanged
- Retrieval, chunking, optimizer, selection, routing and benchmark behavior. The frozen 480-configuration search space hash is asserted by a test.

## Internal milestones (not released)

### 1.0.0-alpha - 2026-10-01
- V1 architecture: control/data plane split, versioned immutable ContextPlans with rollback, held-out evaluation, integrity report, Pareto front, question router, provenance, benchmark mode, security controls.

### 0.1.0-mvp - 2026-09-30
- MVP context optimizer demo.
