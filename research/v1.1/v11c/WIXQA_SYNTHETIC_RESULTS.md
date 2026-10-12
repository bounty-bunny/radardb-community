# WixQA Synthetic secondary generalization test: FusionContextPlan vs Global Fixed

**New questions, familiar corpus. This is not new-corpus evidence.** Locked test, run once: n = 4000 WixQA Synthetic questions (LLM-generated, 1 gold article each) on the 6,221-article WixQA KB. Lock `a67c294`; run at `a67c294`. Held-out labels read: 4000. The plan was derived only from the 280 WixQA development questions and was not changed.

**Result.** FusionContextPlan improved Recall@5 by **+0.7 pts**, from 97.9% to 98.5%, paired 95% CI [+0.4, +1.0] (10,000 resamples, seed 20261001).

- Scientific rule (Δ > 0, CI excludes 0): **MET**
- Product decision rule (also Δ ≥ +5.0): **NOT MET**. The decision rule does not by itself establish that the true effect exceeds 5 points; read the CI.
- Per question: fusion improves 34 / ties 3959 / harms 7. Success@5 McNemar: 34 vs 7, p = 2.53e-5.
- Two-plan oracle 98.9%; headroom captured 67% (diagnostic).

| Metric | Global Fixed | FusionContextPlan |
|---|---|---|
| Recall@5 | 97.9% | 98.5% |
| Recall@10 | 98.3% | 98.8% |
| nDCG@10 | 93.5% | 94.5% |
| Success@5 | 3914 / 4000 | 3941 / 4000 |
| Context tokens (mean) | 2232 | 2143 |

**Gold in the top 5, by which branches retrieved it:** both 3865, Global-only 55, partner-only 21.

**Pre-declared diagnostic split** (gold article shared with a development question):

| Split | n | Global | Fusion | Δ [95% CI] |
|---|---|---|---|---|
| shares gold with development | 155 | 96.1% | 95.5% | −0.6 [−3.2, +1.3] |
| no shared gold | 3845 | 97.9% | 98.6% | +0.7 [+0.4, +1.1] |

**Measured latency** (ms, p50 / p95; seeded subsample n = 300, caches bypassed): Global alone 1209 / 1398; fusion end-to-end 1313 / 1546; branches (wall) 1286 / 1520; fusion step 0.05 ms.

**Resources and deviations.**

- Quality pass 17739 s; total 18507 s; peak RSS 2088 MB.
- Token-budget violations: 0.
- Stand-alone Global vs fusion Global-branch mismatches on the latency subsample: 0.
