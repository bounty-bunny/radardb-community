# WixQA SELECTION LOCK

**Selections use the 280 optimization questions only. Held-out labels read: 0.** Created 2026-10-03T15:34:02.663Z. The frozen engine is `a2464f5` (src sha256 `565e26006d1b4e0e51bc5f60fea35ffd4a5f4a38369f3b819da7b62ff3fca4b8`).

## Locked hashes

| Item | Value |
|---|---|
| Candidate space | 480 configs, sha256 `84281130cfbf0a9f5b935e3279093464353cfc8c9031d5895cda574870f621c3` |
| Split | `validation/splits/wixqa.json` sha256 `c75fe95ed0e50fc40774cef5f903e9c6f444f7166cbd6206c108d756678ca87b` (280 / 120, seed 20261001) |
| Dataset | WixQA @ `d662dc42479c14e202eccd832f8c4b66a035c4cc`, full (6,221 articles), datasetVersion `040a7a418663`, manifest `704dc3aacd62917170e45e27cbcfce75b0e164087cc492a4c573a5697ae27d78` |
| Optimization search | search.json sha256 `398a09d450fa2cfd37568ed3bfbdb5924745c3952ff3f8d149323018adb34180`; F f-search.json sha256 `ff57d68661302621acc4912d7fb02ae0aa5f60b37ffa606a848888581cb4fad7` |
| Router | `rules-v1`, fallback threshold 0.5, class plan if >= 3 optimization questions |

## Locked systems (objective quality unless noted)

| System | Plan / config ID | Opt. coverage | Opt. success | Tokens |
|---|---|---|---|---|
| Best Global Fixed (quality) | `fixed-512\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 70.0% | 64.6% | 3380 |
| Best Global Fixed (balanced) | `section\|vector\|minilm-l6\|-\|-\|cross-encoder\|k8` | 70.2% | 64.3% | 2279 |
| Baseline A (quality) | `section\|lexical\|-\|-\|-\|none\|k8` | 54.0% | 48.6% | 2530 |
| Baseline B (quality) | `section\|vector\|minilm-l6\|-\|-\|none\|k8` | 67.0% | 61.4% | 2015 |
| Baseline C (quality) | `section\|hybrid\|minilm-l6\|-\|-\|none\|k8` | 70.1% | 63.9% | 2311 |
| Baseline D (quality) | `fixed-512\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 70.0% | 64.6% | 3380 |
| **RadarDB ContextPlans (quality)** — wixqa-full-quality-v1 | | | | |
| &nbsp;&nbsp;plan_wixqa_quality_fallback | `fixed-512\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 70.0% | 64.6% | 3380 |
| &nbsp;&nbsp;plan_wixqa_quality_procedure (71 q) | `section\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 74.2% | 66.2% | 2388 |
| &nbsp;&nbsp;plan_wixqa_quality_root_cause (5 q) | `sentence-window\|hybrid\|minilm-l6\|-\|-\|none\|k3` | 60.0% | 60.0% | 388 |
| &nbsp;&nbsp;plan_wixqa_quality_lookup (15 q) | `fixed-256\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 80.0% | 73.3% | 1974 |
| &nbsp;&nbsp;plan_wixqa_quality_general (189 q) | `fixed-512\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 71.1% | 65.6% | 3351 |
| **RadarDB ContextPlans (balanced)** — wixqa-full-balanced-v1 | | | | |
| &nbsp;&nbsp;plan_wixqa_balanced_fallback | `section\|vector\|minilm-l6\|-\|-\|cross-encoder\|k8` | 70.2% | 64.3% | 2279 |
| &nbsp;&nbsp;plan_wixqa_balanced_procedure (71 q) | `section\|hybrid\|minilm-l6\|-\|-\|none\|k8` | 73.2% | 66.2% | 2154 |
| &nbsp;&nbsp;plan_wixqa_balanced_root_cause (5 q) | `sentence-window\|hybrid\|minilm-l6\|-\|-\|none\|k3` | 60.0% | 60.0% | 388 |
| &nbsp;&nbsp;plan_wixqa_balanced_lookup (15 q) | `fixed-256\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 80.0% | 73.3% | 1974 |
| &nbsp;&nbsp;plan_wixqa_balanced_general (189 q) | `section\|vector\|minilm-l6\|-\|-\|cross-encoder\|k8` | 70.1% | 64.0% | 2271 |
| Baseline F — OUTSIDE RADARDB (bge-small-en-v1.5, preregistered fallback) | `fixed-512\|k8` | 67.8% | 62.1% | 3172 |

Baseline F fallback: bge-base-en-v1.5 WixQA full: RESOURCE_LIMIT_FAILURE / EMBEDDING_TIME_LIMIT (wixqa-baselineF-feasibility-bge-base-full.json). Query embedding: batches of 32 over the split question list in task order (as at selection; DEVIATIONS 2026-10-02).

## Primary (unchanged)

RadarDB ContextPlans (quality) vs Best Global Fixed (quality) on the 120 locked held-out questions, pooled question-level Recall@5. **H1 succeeds iff Δ >= +5.0 pts AND the paired bootstrap 95% CI (10,000 resamples, seed 20261001) excludes 0.** The threshold will not be reinterpreted after the result.

## Heterogeneity state (optimization only, DIAGNOSTIC; never used for selection)

| Diagnostic | Value |
|---|---|
| Global Recall@5 | 62.38% |
| Questions routed differently | 91/280 |
| Unique effective plans | 4 |
| Other config beats global | 86/280 |
| Oracle Recall@5 | 88.04% |
| Oracle gap | +25.65 pts |
| RadarDB routing CV delta | -2.8 pts [-6.37, 0.65] |
| Global rank by Recall@5 (in-sample) | 33 of 480 |
| Length-tercile CV | +4.4 pts [+1.6, +7.3]; did not replicate in post-hoc check; NOT used in V1 or this lock |

## Recorded expectation (before held-out access)

H1 is unlikely to succeed (out-of-fold rules-v1 routing −2.8 pts on optimization data). This expectation comes only from optimization data; the held-out test is run regardless, with the unchanged criterion.

## Pre-declared post-hoc diagnostics (not hypothesis tests)

1. Per routed class (general / procedure / lookup / root_cause): n, Global R@5, RadarDB R@5, Δ.
2. A per-question transition matrix: RadarDB beats / ties / loses to Global.
3. Specialization outcomes for questions routed away from Global: correct (improves), harmful (worsens), neutral (ties).

## Verification

Held-out labels read: 0 · search space matches frozen enumerateSpace() · src/ unchanged · no benchmark-informed modifications · length routing NOT added.
