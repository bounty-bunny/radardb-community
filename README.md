# RadarDB

**Your AI assistant is only as good as the context it is given. RadarDB finds, and proves, the retrieval setup that gives it the right context.**

Retrieval-augmented applications depend on decisions most teams make once, by intuition:
- how documents are chunked;
- whether to search by keywords, by meaning, or both;
- whether to rerank;
- how much text to pass to the model.

Get them wrong, and the model answers from the wrong pages. RadarDB tests those decisions against **your own questions** and keeps the best configuration. It then checks that choice on held-out questions it never tuned on, and serves it through one local API, with provenance for every passage.

> **Status:** early (0.x), single-user, local-first. No account, no cloud service, no telemetry. APIs may change before 1.0. **License: [Apache-2.0](LICENSE).**

## Why retrieval optimization matters

- **The same model gives different answers with different context.** If the passage that answers a question is not retrieved, no prompt or model fixes it.
- **There is no universally best configuration.** Chunk size, lexical vs semantic search and reranking interact with your documents and your users' questions. What wins on one corpus loses on another.
- **Cheaper context is real money.** Passing fewer, better passages lowers LLM token cost and latency, as long as the evidence is still there. RadarDB measures both.
- **Most tuning is not measured honestly.** RadarDB separates optimization questions from held-out questions, checks for leakage, and reports confidence intervals.

## Five-minute start

Requires Node.js 20.9+.

```bash
npm install
npm run radar -- doctor
npm run dev            # console at http://127.0.0.1:3000 (bound to localhost)
```

```text
ok    Node.js: v24.19.0 (requires >= 20.9)
info  Workspace: /home/you/radardb/.radar does not exist yet; it is created with the demo dataset on first use
ok    Workspace writable: /home/you/radardb/.radar
info  Model all-MiniLM-L6-v2: not cached yet; downloaded once from the Hugging Face Hub on first use (network required that one time)
info  Model ms-marco-MiniLM-L-6-v2: not cached yet; downloaded once from the Hugging Face Hub on first use (network required that one time)
info  Telemetry: none — RadarDB sends no usage data anywhere
info  API key: RADAR_API_KEY not set: the data plane accepts localhost requests only

All checks passed.
```

Then try the [quick-start example](examples/quickstart/), a 10-article synthetic help center with 20 questions:

```bash
RADAR_DATA_DIR=.radar/quickstart RADAR_SOURCES_ROOT=examples/quickstart \
  npm run benchmark -- docs examples/quickstart/questions.json "Quillstack quick start"
```

```text
480 configurations tested on optimization questions only.
## Held-out validation (questions never used for selection)
| | Evidence coverage | Retrieval success | Context precision | Context tokens |
| Typical retrieval | 100.0% | 100.0% (95% CI 64.6%–100.0%) | 22.9% | 515 |
| RadarDB plans     | 100.0% | 100.0% (95% CI 64.6%–100.0%) | 38.1% | 202 |
Measured retrieval latency: typical ~5–7 ms p50; RadarDB ~160–350 ms p50 (reranker; machine-dependent).
```

On this tiny synthetic corpus both find all the evidence. RadarDB delivers it in about 60% fewer tokens, at higher latency. It is a demonstration of the workflow, not of real-world gains. More: [docs/QUICKSTART.md](docs/QUICKSTART.md).

## The workflow

```
optimize → deploy → query → export → validate
```

```bash
npm run optimize -- balanced --deploy                    # search 480 configurations, validate on held-out questions, deploy
npm run radar -- context "Who approved deploy DEP-1187?"   # run the deployed ContextPlan
npm run radar -- plan export --out plan.json             # portable radardb.plan-release v1 document
npm run radar -- plan validate plan.json                 # check any plan file
npm run radar -- manifest --out experiment.json          # what the experiment ran on (hashes)
```

Your application calls `POST /api/v1/context` and receives passages with provenance (document, chunk, method, scores, plan version). It keeps its own LLM. See [docs/API_REFERENCE.md](docs/API_REFERENCE.md).

## What is in the Community Edition

| Capability | Status |
|---|---|
| Local ingestion of Markdown/text folders and uploads | IMPLEMENTED |
| Four chunkers; BM25, dense (MiniLM) and hybrid retrieval; cross-encoder reranking; exact-identifier boost; entity-graph expansion | IMPLEMENTED |
| Optimizer over 480 configurations with held-out validation, integrity checks and objectives (quality, balanced, cost, latency) | IMPLEMENTED |
| Versioned plans: deploy, rollback, portable export and validation | IMPLEMENTED |
| `POST /api/v1/context` with provenance; console; benchmark reports; `radar` CLI | IMPLEMENTED |
| Public engine API and JSON Schemas | IMPLEMENTED (0.x stability) |
| Benchmark reproduction kit (EnterpriseRAG-Bench, WixQA) | IMPLEMENTED (datasets downloaded from their sources) |
| **FusionContextPlan**: two complementary plans fused under the same token budget | **EXPERIMENTAL** (engine; not yet served by `/api/v1/context`) |
| JSON/JSONL/CSV importers, gold-document metrics in the benchmark | PLANNED |

Community vs commercial: [docs/COMMUNITY_VS_COMMERCIAL.md](docs/COMMUNITY_VS_COMMERCIAL.md). There are no feature locks in this repository.

## Evidence, stated carefully

| Locked evaluation (public datasets) | Comparison | Result: Recall@5, paired 95% CI |
|---|---|---|
| WixQA, 120 held-out questions | per-question-type plans vs best single configuration | +0.8 points [−1.7, +4.2]: **no significant gain** |
| EnterpriseRAG-Bench, 10K documents, 142 held-out questions | experimental FusionContextPlan vs best single configuration, same token budget | 82.3% → 87.7%, **+5.4 points [+2.3, +9.1]** |
| WixQA Synthetic, 4,000 new questions on the same corpus | same | 97.9% → 98.5%, **+0.7 [+0.4, +1.0]** (near ceiling) |

Results for one further benchmark are withheld until its redistribution terms are verified. The baseline is RadarDB's own best single configuration, not another product. Results answer different questions and are not pooled. Methods and reproduction: [docs/BENCHMARK_REPRODUCIBILITY.md](docs/BENCHMARK_REPRODUCIBILITY.md).

RadarDB measures whether retrieved context contains the evidence a correct answer needs. It does **not** grade LLM answers. Gains on one workload do not transfer automatically.

## Limits you should know

Single user, localhost by default. Plain-JSON storage that tops out around 250K cached vectors. Model versions are not pinned. CPU inference, where reranking adds latency. Full list: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Documentation

[Quick start](docs/QUICKSTART.md) · [Installation](docs/INSTALLATION.md) · [Evaluate your data](docs/LOCAL_EVALUATION.md) · [Pilot guide](docs/PILOT_GUIDE.md) · [Architecture](docs/ARCHITECTURE.md) · [API reference](docs/API_REFERENCE.md) · [Benchmark protocol](docs/BENCHMARK_PROTOCOL.md) · [Reproducibility](docs/BENCHMARK_REPRODUCIBILITY.md) · [Datasets](docs/DATASETS.md) · [Limitations](docs/LIMITATIONS.md) · [Security model](docs/SECURITY_MODEL.md) · [Roadmap](docs/ROADMAP.md) · [FAQ](docs/FAQ.md) · [Decisions](docs/adr/)

## Contributing and security

Contributions are welcome with a DCO sign-off: [CONTRIBUTING.md](CONTRIBUTING.md). Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Governance: [GOVERNANCE.md](GOVERNANCE.md). Maintainers: [MAINTAINERS.md](MAINTAINERS.md). Report vulnerabilities privately: [SECURITY.md](SECURITY.md).
