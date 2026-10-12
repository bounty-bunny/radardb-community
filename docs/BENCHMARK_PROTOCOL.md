# Benchmark protocol (summary)

How RadarDB's public-benchmark evaluations were run, so a reader can judge the results. The full preregistration and deviation logs also cover a benchmark whose data can't be redistributed (MTRAG), so this summary is written for the public kit. It describes the same rules.

## Rules fixed before any evaluation

1. **Frozen engine.** The RadarDB code under test was frozen at a tagged commit. The harness checks that `src/` is unchanged before every run.
2. **Locked splits.** Questions were split 70/30 into optimization and held-out sets with a fixed seed (`20261001`), before any optimization:
   - stratified by question type or subset;
   - grouped so that questions with identical gold documents, identical text, or near-duplicate text (content-word Jaccard ≥ 0.6) never straddle the split;
   - the split files are committed (`validation/splits/`).
3. **Selection on optimization questions only.** Every system (each fixed baseline family, the best single configuration, RadarDB's plans, and the external dense baseline) is chosen on optimization questions with the same frozen procedure.
4. **A selection lock before the test.** The chosen systems, metrics, bootstrap procedure, success criteria and expected outcome are written to a lock file and committed before held-out labels are read.
5. **One attempt.** Each held-out test runs once. Failures and null results are reported, and nothing is re-tuned after seeing a result.
6. **Statistics.**
   - Primary metric: question-level Recall@5 on the distinct-document ranking the LLM would receive (no padding).
   - Paired bootstrap 95% CI, 10,000 resamples, seed `20261001`; exact McNemar on Success@5.
   - Scientific rule: Δ > 0 with the CI excluding 0. Product decision rule: Δ ≥ +5.0 points and the CI excluding 0. A met decision rule does not establish that the true effect exceeds 5 points.
7. **Equal budgets.** FusionContextPlan's context is assembled under the token count the best single configuration produced for the same query.
8. **Resource budgets.** Representation ≤ 2 h, optimizer ≤ 6 h, held-out evaluation ≤ 2 h, RSS ≤ 10 GB. An exceeded budget is recorded as a failure, not retried with larger limits.
9. **No pooling.** Results on different benchmarks answer different questions and are reported separately.

## Datasets used in the public kit

| Dataset | License | Revision | Use |
|---|---|---|---|
| EnterpriseRAG-Bench | MIT | `69916e31c68aa5963c00248fd7f0bc12d04fd235` | 470 scorable questions, 142 held out; 2K and 10K document subsets (all gold documents plus seeded distractors) |
| WixQA | MIT | `d662dc42479c14e202eccd832f8c4b66a035c4cc` | ExpertWritten + Simulated (400; 120 held out); Synthetic (6,221 → 6,192 eligible after duplicate exclusion; 4,000 seeded sample) |

## Scoring adapter

RadarDB natively scores whether required evidence phrases appear in the context. The public benchmarks provide gold **document ids**, so the harness uses a document-relevance adapter: Recall@k, nDCG, MRR and Success@k over the ranked distinct documents. This adapter is an evaluation capability of the harness; it is not part of the product benchmark yet (see ROADMAP).
