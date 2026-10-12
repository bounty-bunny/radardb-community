# V1.1B EnterpriseRAG held-out result: FusionContextPlan vs Global Fixed

**Locked test, run once.** EnterpriseRAG-Bench held-out (n = 142), 10K corpus (`eaaf489450a5`). Lock `5dc1bf9`; evaluator `d91a302` (smoke-tested on optimization questions only); run at `4210477`. Held-out labels read: 142 (= n).

- **Global Fixed:** `fixed-512\|lexical\|-\|-\|graph\|none\|k8`
- **FusionContextPlan:** `fusion[v1](fixed-512\|lexical\|-\|-\|graph\|none\|k8 + section\|hybrid\|minilm-l6\|exact\|graph\|none\|k5; rrf60; rerank=none)`

## Primary: Recall@5

| | Global Fixed | FusionContextPlan |
|---|---|---|
| Recall@5 | 82.3% | 87.7% |

**Δ = +5.4 pts**, paired bootstrap 95% CI [+2.3, +9.1] (10,000 resamples, seed 20261001).

- **Scientific success** (Δ > 0, CI excludes 0): **MET**
- **Product-relevant success** (also Δ ≥ +5.0): **MET**
- Headroom captured: two-plan oracle 87.9%, headroom +5.6 pts, captured **97%** (diagnostic)

## Secondary (same frozen run)

| Metric | Global Fixed | FusionContextPlan |
|---|---|---|
| Recall@10 | 85.3% | 89.6% |
| nDCG@10 | 82.1% | 83.1% |
| Success@5 | 110 / 142 | 118 / 142 |
| Final context tokens (mean) | 5990 | 5765 |

- Exact McNemar on Success@5: fusion-only 8 vs global-only 0, p = 0.008.
- **Per question (Recall@5): fusion improves 12 / ties 129 / harms 1.**

**Branch contribution** (gold documents, by which branches retrieved them):

| | Both | Global-only | Partner-only |
|---|---|---|---|
| Top 5 | 145 | 22 | 8 |
| Whole context | 145 | 28 | 10 |

## Measured latency (ms, p50 / p95; caches bypassed, models warm)

| Global Fixed alone | Fusion end-to-end | Query embedding | Global branch | Partner branch | Branches (wall) | Fusion step | Shared rerank | Assembly |
|---|---|---|---|---|---|---|---|---|
| 66 / 88 | 182 / 238 | 7.55 / 11 | 173 / 229 | 109 / 144 | 173 / 229 | 0.06 / 0.09 | 0.00 / 0.00 | 0.97 / 1.62 |

## Per question type (diagnostic, Recall@5)

| Type | n | Global | Fusion | Improves / harms |
|---|---|---|---|---|
| basic | 53 | 90.6% | 94.3% | 2 / 0 |
| completeness | 6 | 36.7% | 44.4% | 2 / 0 |
| conflicting_info | 6 | 91.7% | 100.0% | 1 / 0 |
| constrained | 9 | 83.3% | 88.9% | 1 / 0 |
| intra_document_reasoning | 12 | 100.0% | 100.0% | 0 / 0 |
| miscellaneous | 6 | 100.0% | 100.0% | 0 / 0 |
| project_related | 12 | 80.8% | 82.3% | 2 / 1 |
| semantic | 38 | 68.4% | 78.9% | 4 / 0 |

## Resources and execution deviations

- Run time 219 s (both systems, quality pass and cold-latency pass); peak RSS 4726 MB (sampled every 500 ms).
- Token-budget violations: 0. Questions where the fusion's Global branch differs from the stand-alone Global run: 0.
