# Quick-start example: a 10-article help center

A **synthetic**, fictional help center ("Quillstack": billing, SSO, API limits, error codes, webhooks, exports, release notes, an incident report, plans) with 20 questions. Each question lists the exact evidence a correct answer must contain. The split is fixed in `questions.json`: 13 optimization questions and 7 held-out questions that RadarDB never uses for selection.

## Run it (about 20 seconds after the models are cached)

macOS / Linux:

```bash
RADAR_DATA_DIR=.radar/quickstart RADAR_SOURCES_ROOT=examples/quickstart \
  npm run benchmark -- docs examples/quickstart/questions.json "Quillstack quick start"
```

Windows PowerShell:

```powershell
$env:RADAR_DATA_DIR = ".radar/quickstart"; $env:RADAR_SOURCES_ROOT = "examples/quickstart"
npm run benchmark -- docs examples/quickstart/questions.json "Quillstack quick start"
```

The separate data directory keeps the example out of your main workspace. The Markdown report is written to `.radar/quickstart/benchmarks/<id>/report.md`.

## Expected output (verified on 2026-10-11; four runs, two of them clean installs, identical quality and token figures)

```
Questions: 13 optimization, 7 held-out, 0 without required evidence (not scored).
480 configurations tested on optimization questions only.

## Held-out validation (questions never used for selection)

| | Evidence coverage | Retrieval success | Context precision | Context tokens | Estimated cost / query |
|---|---|---|---|---|---|
| Typical retrieval | 100.0% | 100.0% (95% CI 64.6%–100.0%) | 22.9% | 515 | $0.00155 |
| RadarDB plans | 100.0% | 100.0% (95% CI 64.6%–100.0%) | 38.1% | 202 | $0.00062 |

Measured retrieval latency (varies by machine and load; range over four runs): typical 5–7 ms p50 / 51–85 ms p95; RadarDB 162–349 ms p50 / 514–597 ms p95.
...
Evaluation integrity: Passed.
```

Latency differs by machine and run. The dataset id in the report header differs per run, because benchmark documents are namespaced by run.

## What this shows, and what it does not

- **Shows:** the workflow end to end (search 480 configurations on the optimization questions, check the choice on held-out questions, report), and a real trade-off. On this corpus both approaches find all required evidence. RadarDB's plans deliver it in about **60% fewer context tokens** (202 vs 515) with higher context precision, but at **higher latency**, because one of the selected plans uses the cross-encoder reranker.
- **Does not show:** better answers, or any gain on real data. Ten short synthetic articles are easy: typical retrieval already reaches 100% coverage here. Seven held-out questions give a 95% interval of 65–100% for both systems, so this example cannot show a quality difference. For real conclusions, run the benchmark on your own documents and questions ([docs/LOCAL_EVALUATION.md](../../docs/LOCAL_EVALUATION.md)).

## Use it as a template

Replace `docs/` with your own Markdown or text files and `questions.json` with your questions. Keep `"split"` if you want a fixed, reproducible split; omit it to let RadarDB assign one.
