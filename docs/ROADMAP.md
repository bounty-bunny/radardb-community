# Roadmap

Dates are not promised.

| Status | Item |
|---|---|
| **IMPLEMENTED** | Engine, optimizer, held-out validation, integrity, versioned plans, deploy/rollback, `/api/v1/context`, benchmark, console |
| **IMPLEMENTED** | Public engine API (0.x), versioned schemas and JSON Schemas, portable plan export/validate, experiment manifest, `radar` CLI |
| **EXPERIMENTAL** | FusionContextPlan in the engine (validated offline; see BENCHMARK_REPRODUCIBILITY.md) |
| **PLANNED (next)** | Serve FusionContextPlan through `/api/v1/context`, with shadow mode |
| **PLANNED (next)** | JSON / JSONL / CSV importers for documents, questions, gold labels and baseline outputs |
| **PLANNED (next)** | Gold-document-id evaluation (Recall@k, nDCG, MRR) in the community benchmark |
| **PLANNED** | npm workspaces: `@radardb/engine` package (ADR 0001); `radar` binary |
| **PLANNED** | Pinned, checksum-verified model revisions; deterministic cross-encoder scoring for duplicate passages |
| **IMPLEMENTED** | Reproduction kit for EnterpriseRAG-Bench and WixQA (dataset download with checksums, reproduction mode); quick-start example |
| **BLOCKED** | Publication of a third benchmark's results and harness, pending redistribution rights |
| **PLANNED** | Official Docker image |
| **PLANNED** | Plan-release import into a workspace |
| **IMPLEMENTED** | Apache-2.0 license with DCO sign-off (ADR 0002) |
| **Commercial (planned)** | Hosted cloud, managed connectors, scheduled evaluation, alerts, teams, SSO, audit |

Not planned for the community edition: telemetry, required accounts, license keys.
