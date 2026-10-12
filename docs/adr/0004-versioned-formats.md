# ADR 0004: Versioned, validated formats for anything that leaves a workspace

- **Status:** Accepted (implemented)
- **Date:** 2026-10-11

## Decision

- **Source of truth:** runtime zod schemas in `src/core/schemas.ts`. JSON Schema files in `schemas/` are generated from them (`npm run schemas`), and CI fails if they drift.
- **Format names:**
  - `radardb.plan-release` v1: an exported plan set (configs, metrics, confidence, dataset version, router version);
  - `radardb.experiment-manifest` v1: what an experiment ran on, with a deterministic `manifestHash`.
- **Readers** reject unknown `schemaVersion` values with a readable error instead of guessing.
- **Migrations** are explicit functions. The first one converts the legacy `GET /api/plans` release view into v1.
- The workspace file itself (`.radar/state.json`, `SCHEMA_VERSION = 2`) stays an internal format. Portability goes through exported documents, not by sharing state files.

## Rationale

Local-to-cloud migration, reproducibility and third-party tooling all need a stable file contract. Validation at the boundary protects the engine from malformed configurations; for example, vector retrieval without an embedding model is rejected.

## Consequences

Adding a field to a format means a new schema version, or an optional field with a CHANGELOG entry. Removing or renaming a field always needs a new version plus a migration.
