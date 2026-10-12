# Limitations

What RadarDB 0.x does not do, or does with caveats. Read this before relying on results.

## Model versions and numeric variability

- **Unpinned downloads.** `Xenova/all-MiniLM-L6-v2` (embeddings) and `Xenova/ms-marco-MiniLM-L-6-v2` (reranker) are downloaded from the Hugging Face Hub on first use, without a pinned revision. If those repositories change, results can change.
- **Cache keys ignore model version.** Cached embeddings and reranker scores (`.radar/cache/`) are keyed by model name and text, not by model revision or runtime version. After a model or `@huggingface/transformers` upgrade, **delete `.radar/cache/`** before comparing results.
- **8-bit dynamic quantization.** Some scores depend slightly on what else is in the same inference batch. The same inputs in the same batches are bit-identical; different batching can move scores enough to swap near-tied candidates.
- **Duplicate passages.** Byte-identical passages share one cached reranker score. On a cold cache they may be scored in different batches and get slightly different scores, so tie order can differ between a cold and a warm run.
- **Platform.** ONNX Runtime differs across CPUs and operating systems in small floating-point details. Expect identical rankings on the same machine, and near-identical (not guaranteed identical) rankings elsewhere.

## Storage and scale (JSON persistence)

- **State.** Workspace state is one JSON file (`.radar/state.json`, atomic whole-file writes). There is a single writer process, no concurrent access, and no database.
- **Embedding cache.** It is serialized as one JSON string and fails beyond about **250,000 cached vectors** (V8's 536,870,888-character string limit). The four-chunking search space reaches that at roughly a few tens of thousands of documents.
- **Benchmark mode** is limited to 2,000 documents, 20M characters and 500 questions.
- **Search** scans every chunk per query (no approximate nearest-neighbor index). Measured: about 0.07 s per query for a lexical plan and about 0.18 s for a two-branch fusion at 10K documents; cross-encoder reranking adds 1–5 s per query on a laptop CPU at larger scales.
- **Memory.** About 5 GB peak was measured for a 10K-document corpus with one embedding representation.

## Experimental: FusionContextPlan

- **Not served yet.** Available through `experimental.fusion` in the engine API. It is **not** executed by `/api/v1/context` and not shown in the console.
- **Exactly two plans.** It needs both plans' representations in memory. Latency is roughly the slower branch, or the sum when both rerank, because branches share one CPU thread.
- **Fixed budget.** The token budget always equals the primary plan's context for that query. Fusion never adds text, so lower-ranked partner passages can be dropped.
- **Selection outside the console.** Choosing the partner and the "fuse or not" gate uses the research tools in `research/v1.1/v11b` (final fit), not the optimizer UI. The gate can decide not to fuse, which is a valid outcome.
- **Evidence is benchmark-specific.** It is validated on locked public benchmarks. Benefits were concentrated in workloads with a stable complementary partner and were negligible near ceiling. Your data may differ.
- **No compatibility promise.** Its API may change in any release (it is outside the STABLE surface).

## Other

- **Security.** Single user, localhost-only by default; no authentication, roles or document-level permissions; plain JSON at rest (rely on disk encryption). See SECURITY.md.
- **Scoring.** The product benchmark scores required-evidence phrases. Gold-document metrics exist only in the benchmark harness. Answers are not graded.
- **Ingestion.** Markdown and text folders and uploads only. JSON/JSONL/CSV importers are planned.
- **Router.** The rule-based question classes did not beat the best single configuration in locked tests. Treat per-class plans as experimental too.
