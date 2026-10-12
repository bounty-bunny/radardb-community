# Community and commercial boundaries

**Principle:** the community edition is a complete, local product: ingestion, retrieval, evaluation, optimization, deployment of plans, API and CLI. The commercial offering sells **operating RadarDB for an organization**: hosting, scale, continuity, collaboration and governance. It does not sell a better version of the same algorithm.

## Classification

| Capability | Exists today? | Edition | Justification |
|---|---|---|---|
| Retrieval engine (chunkers, BM25/dense/hybrid, reranker, assembler, executor) | yes | **Community** | Core value; publishing it builds trust and adoption |
| Optimizer, held-out validation, integrity checks, objectives | yes | **Community** | Local configuration selection is validated and is the main reason to install |
| Versioned plans, deploy/rollback, portable export | yes | **Community** | Needed for any real local use |
| `/api/v1/context` + provenance, feedback | yes | **Community** | The integration point |
| Context Benchmark, CLI, schemas, experiment manifests | yes | **Community** | Reproducibility is part of the claim |
| Console UI (single user) | yes | **Community** | Local operation |
| FusionContextPlan (two-plan fusion) | engine only | **Community, experimental** (recommended; owner decision) | Withholding the validated mechanism would make the public claim unverifiable. The commercial moat is running it continuously at scale, not the 200-line merge |
| Fusion selection procedure at scale (automatic partner discovery + gating on live workloads) | research harness | **Commercial: managed optimization** | Needs scheduling, data pipelines, history, compute: operations, not algorithms |
| Hosted control plane, multi-tenant provisioning, billing | no | **Commercial** | Hosting is the service |
| Teams, roles, shared evaluation history and dashboards | no | **Commercial** | Organizational, not individual, value |
| Scheduled / continuous evaluation, quality-change alerts | no | **Commercial** | Requires a running service |
| Managed connectors (Confluence, Zendesk, SharePoint, …) and credential vault | no | **Commercial** (local file/JSON importers stay community) | Credential custody and sync infrastructure |
| SSO/SAML/SCIM, audit logs, policy-controlled deployments | no | **Enterprise** | Standard enterprise requirements |
| Cost management and operational analytics | no | **Commercial** | Service-level data |

## Interface contract between editions

The commercial platform consumes only the following, and never deep imports or forks the engine:

1. **`@radardb/engine` public API** (`src/engine/index.ts` today; a package later), versioned by SemVer.
2. **Portable formats:** `radardb.plan-release` v1 and `radardb.experiment-manifest` v1 (`schemas/`).
3. **HTTP contracts:** `/api/v1/context` and `/api/v1/feedback`.

A local workspace moves to the cloud by exporting a plan release (`radar plan export`) and importing it, with no conversion. An import endpoint is planned; the validator (`radar plan validate`) exists now.

## What the community edition will never require

An account, a cloud API key, telemetry enrollment, or network access after the first model download.
