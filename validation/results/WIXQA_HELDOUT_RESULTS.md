# WixQA held-out results — frozen RadarDB V1

**WixQA primary (ExpertWritten + Simulated), full KB (6,221 articles).** Scoring: *External benchmark relevance scoring* (document-ID adapter), not RadarDB V1 native scoring. Selection lock `114b92d`. All systems were selected on the 280 optimization questions only and evaluated once on the same 120 held-out questions.

Expectation recorded in the lock before held-out access: *H1 unlikely* (out-of-fold rules-v1 −2.8 pts on optimization data).

## Primary (H1)

RadarDB ContextPlans (quality) vs E — Best Global Fixed (quality), pooled question-level Recall@5, n = 120.

| | Recall@5 | Σ per-question Recall@5 / n | Gold articles in top-5 / total gold | Success@5 |
|---|---|---|---|---|
| RadarDB ContextPlans (quality) | 60.6% | 72.67 / 120 | 85 / 143 | 68 / 120 |
| E — Best Global Fixed (quality) | 59.7% | 71.67 / 120 | 84 / 143 | 67 / 120 |

Δ = **+0.8 pts**, paired bootstrap 95% CI [−1.7, +4.2] (10,000 resamples, seed 20261001). Per-question wins/ties/losses: 2/117/1. Exact McNemar on Success@5: 2 vs 1, p = 1.000.

**H1: NOT SUPPORTED** (criterion: Δ ≥ +5.0 pts AND CI lower bound > 0).

Stop conditions: S1 (best fixed beats RadarDB by ≥ 2.0 pts, CI excludes 0) **false**; S5 (outside baseline beats the space by ≥ 5.0 pts) **false**; S3 ROUTER_COLLAPSE **false** (max plan share 71.7%).

## Per subset (preregistered: reported per subset and combined)

| Subset | n | RadarDB (quality) | Global Fixed | F | Δ RadarDB − Global [95% CI] | W/T/L |
|---|---|---|---|---|---|---|
| expertwritten | 62 | 67.5% | 65.9% | 68.3% | +1.6 [+0.0, +4.8] | 1/61/0 |
| simulated | 58 | 53.2% | 53.2% | 57.5% | +0.0 [−5.2, +5.2] | 1/56/1 |

## All systems, pooled (n = 120)

| System | R@5 | R@1 | R@3 | R@10 | nDCG@10 | MRR | Success@5 | Coverage | Precision | Tokens mean / median / p95 | Latency p50 / p95 (measured) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RadarDB ContextPlans (quality) | 60.6% | 21.7% | 46.4% | 69.0% | 46.6% | 0.406 | 68/120 | 69.0% | 14.7% | 2968 / 3005 / 4105 | 1470.2 / 1620.7 ms |
| E — Best Global Fixed (quality) | 59.7% | 21.7% | 48.1% | 66.5% | 45.9% | 0.405 | 67/120 | 66.5% | 12.6% | 3313 / 3373 / 4228 | 1503.6 / 1622.1 ms |
| RadarDB ContextPlans (balanced) | 67.8% | 27.5% | 56.4% | 70.1% | 51.3% | 0.459 | 77/120 | 70.1% | 18.7% | 2219 / 2184 / 2908 | 1187.5 / 1475.4 ms |
| E — Best Global Fixed (balanced) | 66.5% | 26.7% | 54.3% | 71.0% | 50.5% | 0.446 | 75/120 | 71.0% | 18.4% | 2287 / 2250 / 2966 | 1231.3 / 1525.2 ms |
| A — Lexical BM25 | 49.0% | 23.8% | 43.3% | 56.4% | 41.4% | 0.380 | 56/120 | 56.4% | 13.5% | 2623 / 2488 / 3570 | 13.5 / 20.1 ms |
| B — Vector MiniLM | 60.6% | 24.9% | 46.4% | 65.4% | 46.2% | 0.418 | 68/120 | 65.4% | 16.3% | 2033 / 2060 / 2618 | 21.7 / 32.8 ms |
| C — Hybrid | 63.3% | 30.3% | 55.6% | 64.9% | 50.7% | 0.472 | 73/120 | 64.9% | 17.3% | 2370 / 2355 / 3249 | 37.2 / 48.6 ms |
| D — Hybrid + cross-encoder | 59.7% | 21.7% | 48.1% | 66.5% | 45.9% | 0.405 | 67/120 | 66.5% | 12.6% | 3313 / 3373 / 4228 | 1503.6 / 1622.1 ms |
| F — bge-small (OUTSIDE RADARDB) | 63.1% | 35.7% | 58.2% | 68.1% | 54.4% | 0.527 | 68/120 | 68.1% | 13.0% | 3196 / 3162 / 4100 | 22.5 / 33.8 ms |

## Secondary comparisons (pooled Recall@5; exploratory)

| Comparison | Δ | 95% CI | W/T/L | McNemar Success@5 |
|---|---|---|---|---|
| RadarDB (balanced) − Global Fixed (balanced) | +1.3 | [−1.7, +4.2] | 3/116/1 | 3 vs 1, p = 0.625 |
| F (bge-small) − Global Fixed (quality) | +3.3 | [−4.6, +11.3] | 18/87/15 | 15 vs 14, p = 1.000 |
| F − best in-space (C — Hybrid) | −0.3 | [−8.6, +8.1] | 17/85/18 | 12 vs 17, p = 0.458 |

## Routing (held-out, rules-v1)

- Router classes: {"general":86,"procedure":19,"lookup":13,"root_cause":2}
- Plans used, quality: {"general":86,"procedure":19,"lookup":13,"root_cause":2}; balanced: {"general":86,"procedure":19,"lookup":13,"root_cause":2}
- Distinct configurations used by RadarDB (quality): 4

## POST-HOC diagnostics (pre-declared in the selection lock; not hypothesis tests)

### Per routed plan (quality)

| Routed class | n | Configuration | Global R@5 | RadarDB R@5 | Δ | W / L |
|---|---|---|---|---|---|---|
| general | 86 | `fixed-512\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` (= Global) | 63.0% | 63.0% | +0.0 | 0 / 0 |
| procedure | 19 | `section\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 52.6% | 52.6% | +0.0 | 1 / 1 |
| lookup | 13 | `fixed-256\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 50.0% | 57.7% | +7.7 | 1 / 0 |
| root_cause | 2 | `sentence-window\|hybrid\|minilm-l6\|-\|-\|none\|k3` | 50.0% | 50.0% | +0.0 | 0 / 0 |
| fallback | 0 | — | — | — | — | — |

### Per-question transitions (RadarDB quality vs Global, Recall@5)

| | Questions |
|---|---|
| RadarDB beats Global | 2 |
| Tie | 117 |
| RadarDB loses to Global | 1 |

| Specialization (questions routed away from the Global configuration) | Questions | Σ R@5 change |
|---|---|---|
| Routed away | 34 | |
| Correct: routed away, retrieval improves | 2 | +2.00 |
| Harmful: routed away, retrieval worsens | 1 | −1.00 |
| Neutral: routed away, tie | 31 | 0 |
| Stayed on the Global configuration | 86 | 0 |

### Locked-configuration oracle (DIAGNOSTIC ONLY; never RadarDB performance)

Per question, the max R@5 over the 8 distinct locked V1 configurations: **82.4%** (Global 59.7%). A locked configuration beats Global on 31/120 held-out questions.

| Locked configuration | Held-out R@5 |
|---|---|
| `section\|vector\|minilm-l6\|-\|-\|cross-encoder\|k8` | 66.5% |
| `fixed-256\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 64.7% |
| `section\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 64.2% |
| `section\|hybrid\|minilm-l6\|-\|-\|none\|k8` | 63.3% |
| `section\|vector\|minilm-l6\|-\|-\|none\|k8` | 60.6% |
| `fixed-512\|hybrid\|minilm-l6\|-\|-\|cross-encoder\|k8` | 59.7% |
| `section\|lexical\|-\|-\|-\|none\|k8` | 49.0% |
| `sentence-window\|hybrid\|minilm-l6\|-\|-\|none\|k3` | 46.4% |

## Resources

V1 evaluation 1055 s (all locked configs plus the cold-latency pass); F index 1085 s / 10637 chunks; RSS at end 4206 MB. Latency is wall-clock per query, with model result caches bypassed and warm indexes, in-process, on this machine (OS build 26300). F latency includes query embedding.

Held-out labels read: 120 (= n).
