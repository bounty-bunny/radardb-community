# Community edition vs commercial offerings

**The community edition contains every engine feature that works today.** A managed cloud and an enterprise edition are **planned** and add hosting and organizational features around the same engine. Neither exists today, nothing below is for sale, and no community feature will move behind a paywall.

Status key: ✓ available · **exp.** experimental (available, API may change) · *planned* not built · — not offered.

## What you get in each edition

| Capability | Community (this repository) | Cloud (*planned*) | Enterprise (*planned*) |
|---|---|---|---|
| **Engine** | | | |
| Chunking (4 strategies), BM25, dense, hybrid RRF, cross-encoder rerank, exact boost, entity graph | ✓ | same engine | same engine |
| Optimizer: 480-configuration search with held-out validation | ✓ | same | same |
| Per-question-type ContextPlans and router | ✓ (**exp.** quality) | same | same |
| FusionContextPlan (two-plan fusion, equal budget) | **exp.** engine API | *managed* | *managed* |
| **Use** | | | |
| Console (single user, localhost) | ✓ | multi-user, hosted | hosted or self-managed |
| CLI (`radar`), REST API `/api/v1/context` | ✓ | ✓ with API keys | ✓ |
| Deploy, rollback, deployment history | ✓ local | ✓ | ✓ with approvals |
| Plan export/import (`radardb.plan-release` v1), experiment manifests, JSON Schemas | ✓ | ✓ | ✓ |
| **Evaluation** | | | |
| Product benchmark, integrity checks, reports | ✓ | scheduled, with history | org dashboards |
| Benchmark harness and reproducibility kit (EnterpriseRAG-Bench, WixQA) | ✓ | — | — |
| Quality-change alerts | — | *planned* | *planned* |
| **Data** | | | |
| Ingestion: local folders and uploads | ✓ | ✓ | ✓ |
| JSON/JSONL/CSV importers | *planned* (community) | ✓ | ✓ |
| Managed connectors (Drive, Confluence, …), private networking | — | *planned* | *planned* |
| Storage | local JSON files | managed | managed, customer region |
| **Organization** | | | |
| Multi-tenancy, teams, roles | — | *planned* | *planned* |
| SSO/SAML, SCIM, enterprise authentication | — | — | *planned* |
| Audit events, retention policies | local history only | *planned* | *planned* |
| Billing, usage metering | — | *planned* | contract |
| Support | community (GitHub) | standard | contractual SLA |
| **Terms** | | | |
| License | Apache-2.0 (*selected; applied once copyright ownership is confirmed*) | commercial terms | commercial terms |
| Account, telemetry or license key required | **never** | account | contract |

## Where the line is

- **Community** = anything that runs on one machine for one user: every retrieval, optimization, evaluation and export capability.
- **Commercial** = operating it for an organization: hosting, multi-tenancy, enterprise identity, managed connectors, scheduling, billing and support. These are built in a separate private codebase that uses the public engine through its versioned interfaces (the STABLE API and the plan-release format). They are not built as a fork.
- Experimental community features (FusionContextPlan, per-class routing) graduate to STABLE in the community edition. They do not graduate into a paid tier.

## Commitments

1. The community edition will not be degraded, rate-limited or feature-locked to drive upgrades.
2. Commercial features are built on the same public engine through versioned interfaces.
3. Moving from local to cloud uses the portable plan-release format, so plans are never locked in.

Details: [architecture/COMMERCIAL_BOUNDARIES.md](architecture/COMMERCIAL_BOUNDARIES.md) and [../GOVERNANCE.md](../GOVERNANCE.md).
