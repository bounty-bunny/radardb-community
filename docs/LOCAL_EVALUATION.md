# Evaluating retrieval on your own data (locally)

RadarDB answers one question: **which retrieval configuration puts the evidence a correct answer needs into the context, on questions it did not tune on?**

## What you need

1. **Documents:** Markdown or text files in a folder under `sources/` (max 2,000 documents and 20M characters in benchmark mode).
2. **Questions:** at least 3 (realistically 50 or more), each with the **required evidence**: exact phrases a correct answer must be grounded in. Alternatives are written as a list.

```json
[
  { "question": "Who approved deploy DEP-1187?", "requiredEvidence": ["DEP-1187", ["Ben Ode", "approved by Ben"]] },
  { "question": "What is the Sev1 paging rule?", "requiredEvidence": ["acknowledge a Sev1 page within 5 minutes"] }
]
```

## Run a benchmark

```bash
npm run benchmark -- my-docs questions.json "first try"
```

Or use **Benchmark** in the console. RadarDB splits your questions into optimization and held-out sets (deterministic, and leakage-checked by the integrity report), searches 480 configurations on the optimization set, and reports held-out results. The Markdown report is written to `.radar/benchmarks/<id>/report.md`. Nothing is deployed.

## Read the results honestly

- **Held-out numbers are the result.** Optimization-set numbers are what the search was tuned on.
- Small held-out sets give wide confidence intervals; the report shows them.
- The metrics measure **context**, not answers: required-evidence coverage, retrieval success (all evidence present), context precision, tokens, estimated cost, measured latency.
- The integrity report flags near-duplicate questions across splits, template reuse, and evidence that appears verbatim in questions.

## Make it reproducible

```bash
npm run radar -- manifest --out experiment.json   # dataset version, question-set hash, search-space hash, router, models
npm run radar -- plan export --out plan.json      # the selected plan set, portable
```

Two runs with the same manifest hash ran on the same data, questions and search space.

## Document-relevance (gold document ids) evaluation

The community build scores evidence phrases. The external-benchmark adapter, which scores gold document ids with Recall@k, nDCG and MRR, is part of the validation harness and is not in this release yet (see [BENCHMARK_REPRODUCIBILITY.md](BENCHMARK_REPRODUCIBILITY.md)).
