# Benchmark reproducibility

Everything needed to re-run RadarDB's locked public-benchmark evaluations is in this repository except the datasets. Those are downloaded from their original sources at pinned revisions and checksum-verified; RadarDB redistributes no dataset (licenses, citations and what derived material is included: [DATASETS.md](DATASETS.md)).

## Results you can reproduce

| Evaluation | Comparison | Result: Recall@5, paired 95% CI | Evidence in repo |
|---|---|---|---|
| WixQA (6,221 articles; 120 held-out questions) | per-question-type ContextPlans vs best single configuration | +0.8 [−1.7, +4.2]: no significant gain | `validation/results/WIXQA_HELDOUT_RESULTS.md`, `wixqa-*.json` |
| EnterpriseRAG-Bench (10K documents; 142 held-out) | experimental FusionContextPlan vs best single configuration, same token budget | 82.3% → 87.7%, +5.4 [+2.3, +9.1] | `research/v1.1/v11b/ERB_V1.1B_RESULTS.md`, `results/erb-*` |
| WixQA Synthetic (4,000 new questions, same corpus) | same | 97.9% → 98.5%, +0.7 [+0.4, +1.0] | `research/v1.1/v11c/WIXQA_SYNTHETIC_RESULTS.md` |
| EnterpriseRAG-Bench 10K, V1 full search space | resource feasibility | exceeded the 2 h representation budget | `validation/results/ENTERPRISERAG_STATUS.md` |
| Frozen search space | 480 configurations | sha256 `84281130…f621c3` (asserted by `tests/manifest.test.ts`) | — |

**Withheld:** RadarDB was also evaluated on IBM MTRAG. Its corpora are licensed for internal evaluation with no redistribution, so its results, identifiers, splits and derived artifacts are not published until redistribution rights are verified.

The protocol is summarized in [BENCHMARK_PROTOCOL.md](BENCHMARK_PROTOCOL.md).

## Requirements

Node.js 20.9+; 16 GB RAM recommended (peaks of about 5 GB were measured); 10 GB of free disk for EnterpriseRAG-Bench. Expect hours of CPU time for the full chains. All commands run from the repository root.

```bash
npm ci && (cd validation && npm ci)          # the harness has one extra dependency (parquet reader)
export NODE_OPTIONS=--max-old-space-size=8192 # PowerShell: $env:NODE_OPTIONS = "--max-old-space-size=8192"
export RADAR_REPRODUCE=1                      # PowerShell: $env:RADAR_REPRODUCE = "1"  (see "What reproduction mode means")
T="node node_modules/tsx/dist/cli.mjs"
$T --tsconfig validation/tsconfig.json validation/harness/fetch-datasets.ts wixqa          # ≈ 60 MB
$T --tsconfig validation/tsconfig.json validation/harness/fetch-datasets.ts enterpriserag  # ≈ 1.4 GB
```

`fetch-datasets.ts --verify-only` re-checks the sha256 of every file.

## Reproduce the EnterpriseRAG-Bench FusionContextPlan result

| Step | Command | Time (laptop CPU) |
|---|---|---|
| 1. Split and corpus manifests (must match the locked `validation/splits/enterpriserag.json`) | `$T --tsconfig validation/tsconfig.json validation/harness/erb-prepare.ts` | minutes |
| 2. V1 optimization search at 2K (optimization questions only) | `$T --tsconfig validation/tsconfig.json validation/harness/erb-compat.ts 2000` | ≈ 2–3 h |
| 3. (optional) Re-derive the candidate FusionContextPlan; compare with `research/v1.1/v11b/results/candidate-fusionplan-erb-2k.json` | `$T --tsconfig research/v1.1/tsconfig.json research/v1.1/v11b/final-fit.ts erb-2k` | ≈ 10 min |
| 4. Build only the two 10K representations the plan needs | `$T --tsconfig research/v1.1/tsconfig.json research/v1.1/v11b/erb10k-feasibility.ts` | ≈ 35 min |
| 5. Re-run the locked held-out evaluation in reproduction mode | `$T --tsconfig research/v1.1/tsconfig.json research/v1.1/v11b/erb-heldout.ts heldout` | ≈ 4 min |
| 6. Compare with the sealed result | `$T --tsconfig research/v1.1/tsconfig.json research/v1.1/compare-reproduction.ts research/v1.1/v11b/results/erb-heldout.json research/v1.1/v11b/results/erb-heldout.reproduced.json` | seconds |

Our own reproduction (2026-10-11): **142/142 questions with identical rankings**; Global 82.32%, Fusion 87.71%.

## Reproduce the WixQA results

| Step | Command | Time |
|---|---|---|
| 1. Split + manifests (compare with the locked `validation/splits/wixqa.json`) | `$T --tsconfig validation/tsconfig.json validation/harness/wixqa-preflight.ts` | minutes |
| 2. V1 optimization search, full corpus | `$T --tsconfig validation/tsconfig.json validation/harness/wixqa-feasibility.ts full` | ≈ 4 h |
| 3. Baseline F (bge-small), full corpus | `$T --tsconfig validation/tsconfig.json validation/harness/wixqa-f-feasibility.ts full bge-small` | ≈ 1 h |
| 4. V1 held-out test, using the committed selection lock | `$T --tsconfig validation/tsconfig.json validation/harness/wixqa-heldout.ts` then `wixqa-analyze.ts` | ≈ 40 min |
| 5. Synthetic: candidate plan, population audit, test in reproduction mode | `final-fit.ts wixqa`; `research/v1.1/v11c/synthetic-audit.ts`; `synthetic-eval.ts test`; `compare-reproduction.ts …/synthetic-test.json …/synthetic-test.reproduced.json` | 2–5 h |

Step 4 overwrites `validation/results/wixqa-heldout*.json`. Use `git diff` to compare: retrieval metrics should be identical, while measured latencies differ by machine. In step 3, the original run first tried bge-base, which exceeded its time budget; the preregistered fallback is bge-small.

## What "reproduction mode" means

The locked evaluators normally refuse to run unless their lock was committed in the original repository's history, and they refuse to run twice. Every V1 harness script also checks that the engine is byte-identical to the frozen V1 engine release (`v1.0.0-alpha`), using development history this repository does not contain. `RADAR_REPRODUCE=1`:
- skips only the git-history checks;
- verifies the frozen engine file by file against `validation/harness/frozen-manifest.json` (sha256 of all 138 frozen files, line endings normalized). Five files changed after the freeze in additive ways only (an exported helper, an optional provenance field, two console pages, npm scripts), and two files differ only in release metadata, checked separately: `package-lock.json` in its own version and license fields (all dependencies unchanged), and `tsconfig.json` in its `exclude` list (the benchmark kit has its own typecheck; compiler options unchanged). These are allowed and reported. Any other difference aborts the run;
- still verifies the locked files' sha256 (split, FusionContextPlan implementation, candidate plan);
- writes to `*.reproduced.json`.

Sealed results are never overwritten.

## Provenance identifiers in sealed files

Sealed result and lock files (for example `lockCommit` and `codeCommit` fields, or a "Lock" commit cited in result reports) cite commits of the private development repository where each lock was committed before its test ran. Those commits are not part of this repository, and the files are published byte-for-byte as sealed, because evidence is never edited after the fact. In this repository, integrity rests on what you can check yourself: the sha256 hashes recorded in each lock (split, FusionContextPlan implementation, candidate plan, corpus manifest), the frozen-engine manifest, and re-running the evaluation in reproduction mode.

## Known sources of variation

- **Model files.** Models are downloaded unpinned from the Hugging Face Hub. If the hosted files change, embeddings and reranker scores can change.
- **Quantization.** 8-bit dynamic quantization makes some scores depend on batch composition. The evaluators reproduce the original batching; changing batch sizes can change results.
- **Duplicate passages.** Byte-identical passages may tie differently on cold vs warm reranker caches.
- **Latency.** Machine-dependent; only retrieval metrics are expected to match exactly.

See [LIMITATIONS.md](LIMITATIONS.md).
