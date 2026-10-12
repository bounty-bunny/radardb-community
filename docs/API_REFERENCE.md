# API reference (0.x)

Three public contracts: the HTTP data plane, the TypeScript engine API, and versioned file formats. The control plane HTTP API also exists. It is local-only and powers the console, and it may change without notice before 1.0.

## 1. HTTP data plane

Base URL: `http://127.0.0.1:3000`. If `RADAR_API_KEY` is set, send `Authorization: Bearer <key>`. Otherwise only localhost requests are accepted. Bodies are JSON (max 25 MB); unknown fields are rejected.

### `POST /api/v1/context`

Executes the deployed ContextPlan for a query. It never optimizes.

Request:

```json
{ "query": "Which deploy caused the checkout latency regression?", "constraints": { "maxTokens": 1200, "maxLatencyMs": 500 } }
```

| Field | Type | Rules |
|---|---|---|
| `query` | string | 1–2,000 characters (trimmed) |
| `constraints.maxTokens` | integer | 50–100,000; items that don't fit are dropped and reported in `trace.degradations` |
| `constraints.maxLatencyMs` | integer | 1–60,000; the reranker is skipped when its projected time would exceed it |

Response (200):

| Field | Meaning |
|---|---|
| `requestId` | id for `/api/v1/feedback` |
| `context[]` | `{ text, tokens, provenance }`. Provenance: `sourceId, sourceKind, documentId, documentTitle, chunkId, chunkIndex, method, retrievalScore, rerankScore?, rank, graphPath?, planId, planVersion` |
| `plan` | `{ id, version, questionClass, classLabel, fallbackUsed, config, strategy[] }` |
| `router` | the routing decision, router version and threshold |
| `trace` | `{ steps[], degradations[] }`: per-step timings |
| `metrics` | measured latency, tokens, estimated cost |
| `notice` | reminder that context is untrusted data |

### `POST /api/v1/feedback`

```json
{ "requestId": "req_…", "useful": false, "missingEvidence": "approver name", "note": "optional" }
```

`requestId` ≤ 100 characters; `missingEvidence`, `note` ≤ 2,000 characters. Feeds drift signals.

### Errors

All errors are `{ "error": { "code", "message", "details?" } }`, with no stack traces.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json`, `invalid_request` (with `details[]`), `unsafe_path` | malformed or invalid input |
| 401 | `unauthorized` | missing or wrong API key |
| 403 | `forbidden` | control-plane request to a non-local host |
| 404 | e.g. `no_release`, `release_not_found` | missing resource |
| 409 | `no_deployed_plan` | no validated plan set is deployed yet |
| 413 | `too_large` | body over 25 MB |
| 500 | `internal` | unexpected error (logged locally) |

## 2. Control plane (localhost only; unstable)

`/api/workspace` · `/api/sources` (+ `/[id]`) · `/api/documents` · `/api/evals` · `/api/integrity` · `/api/runs` (+ `/[id]`) · `/api/plans` · `/api/plans/deploy` · `/api/plans/rollback` · **`GET /api/plans/export?releaseId=`** · `/api/benchmarks` (+ `/[id]`) · `/api/playground` · `/api/requests` · `/api/drift` · `/api/reset`.

`GET /api/plans/export` returns a `radardb.plan-release` v1 document (see §4) for the given release. Without a parameter it returns the deployed release, or else the latest one, as a download.

## 3. TypeScript engine API

Import from `src/engine/index.ts` (it will become the `@radardb/engine` package; see ADR 0001). The STABLE export list is pinned by `tests/api-surface.test.ts`.

```ts
import { CHUNKERS, materialize, datasetVersionOf, executePlan, BASELINE_CONFIG, PlanConfigSchema } from "@/engine";

const version = datasetVersionOf(documents);
const reps = await materialize(documents, version, "section", ["minilm-l6"]);
const config = PlanConfigSchema.parse({ ...BASELINE_CONFIG, chunkingStrategy: "section" });
const result = await executePlan(config, "Who approved deploy DEP-1187?", reps, { plan: { id: "local", version: 1 } });
for (const item of result.items) console.log(item.provenance.documentTitle, item.tokens);
```

| Group | Main exports |
|---|---|
| Types and schemas | all `@/core/domain` types; `PlanConfigSchema`, `FusionPlanConfigSchema`, `PortablePlanReleaseSchema`, enum schemas |
| Formats | `toPortableRelease`, `parsePortableRelease`, `createExperimentManifest`, `questionSetHash`, `searchSpaceHash`, `ENGINE_VERSION` |
| Representations | `CHUNKERS`, `materialize`, `datasetVersionOf`, `evictRepresentations`, `BM25`, `denseSearch`, `rrf`, `embed`, `rerankScores`, `warmModels`, `flushModelCaches` |
| Retrieval | `retrieverFor`, `LexicalRetriever`, `VectorRetriever`, `HybridRetriever`, `ExactMatchBooster`, `EntityGraphRetriever`, `rerankerFor`, `ContextAssembler`, `executePlan`, `prepareQuery` |
| Evaluation and optimization | `scoreContext`, `aggregate`, `computeIntegrity`, `optimize`, `validatePlans`, `selectConfig`, `paretoFront`, `enumerateSpace`, `BASELINE_CONFIG`, `demoRouter`, `resolvePlanClass`, cost estimators |
| `experimental` | `fusion` (`fusionPlan`, `executeFusionPlan`, `fuseBranches`, `assembleFused`), `objective` (`selectGlobal`, `dedupeBehaviors`), `portfolio` (`greedyPortfolio`) |

Extension points are TypeScript interfaces exported from the same module: `Chunker`, `Retriever`, `Reranker`, `OptimizerStrategy`, `QuestionRouter`. Implementations are plain objects or classes, with no registration step.

## 4. File formats (`schemas/`)

| Format | Schema file | Produced by | Read by |
|---|---|---|---|
| `PlanConfig` | `plan-config.v1.json` | optimizer | executor, validators |
| `FusionPlanConfig` (experimental) | `fusion-plan-config.v1.json` | `experimental.fusion.fusionPlan` | `executeFusionPlan` |
| `radardb.plan-release` v1 | `plan-release.v1.json` | `radar plan export`, `GET /api/plans/export` | `radar plan validate`, `parsePortableRelease` (also migrates the legacy `/api/plans` shape) |
| `radardb.experiment-manifest` v1 | (TypeScript type `ExperimentManifest`) | `radar manifest`, `createExperimentManifest` | humans, CI, the planned cloud import |

Unknown `schemaVersion` values are rejected. See ADR 0004.
