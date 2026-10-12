# WixQA Synthetic: secondary generalization lock (FINAL; test NOT run)

**Question.** Does the already-developed WixQA FusionContextPlan generalize to a large unseen question population **on the same WixQA corpus**? This tests new questions on a familiar corpus. It is **not new-corpus evidence**.

**Role.** Secondary evidence. It will never be used to change the FusionContextPlan. If it fails, the disagreement is reported, and investigated only after the result is frozen. **Synthetic outcomes read: 0.**

Machine-readable lock: `results/wixqa-synthetic-lock.json`.

## Locked systems (derived only from the 280 WixQA development questions)

| System | Configuration |
|---|---|
| **Global Fixed** | `section \| hybrid \| minilm-l6 \| - \| - \| cross-encoder \| k8` |
| **FusionContextPlan v1** | Global Fixed + partner `sentence-window \| hybrid \| minilm-l6 \| - \| - \| none \| k8`; RRF k = 60; no shared rerank; per-query token budget = Global Fixed's context tokens |

The same V1.1B final-fit procedure as EnterpriseRAG was used. Training gain: +5.6 [+2.4, +8.8], so the gate says **FUSE**.

## Test population

6,221 Synthetic questions. Exclusion rules were fixed before any retrieval:

| Rule | Excluded |
|---|---|
| R1: exact duplicate of any of the 400 primary questions (280 development + 120 burned held-out) | 0 |
| R2: near-duplicate of any primary question (content-word Jaccard ≥ 0.6, the RadarDB integrity rule) | 27 |
| R3: duplicate within Synthetic (keep the first occurrence) | 2 |
| R4: empty or missing gold | 0 |
| **Eligible** | **6,192** (ids sha256 `ad389ccd…`) |

- **Pre-declared diagnostic split:** 239 eligible questions share their gold article with a development question. Results are reported for both groups.
- **Test sample (decided: Option A, approved 2026-10-06):** a **seeded random subsample of 4,000** eligible questions (seed 20261001), drawn by id order before any retrieval.
- **Latency:** measured on a seeded subsample of 300, with caches bypassed.
- **Resource projection:** measured cold cost is 1.41 s per question. That gives a quality pass of ≈ 5,660 s, or ≈ 6,600 s including the latency pass: within the preregistered 2 h budget. With one gold per question, n = 4,000 gives a 95% CI half-width of about ±1 pt.

## Frozen by this lock

- **Population:** the eligible population (6,192 ids, sha256 `ad389ccd…`) and exclusion rules R1–R4.
- **Samples:** the test subsample (4,000, seed 20261001) and the latency subsample (300, seed 20261001).
- **Plans:** the WixQA-derived Global plan and partner; RRF k = 60; no shared rerank (rerank pool 20).
- **Budget:** the token-budget rule (fused context ≤ Global Fixed context tokens per query).
- **Gate:** FUSE.
- **Statistics:** metrics, paired bootstrap (10,000, seed 20261001), scientific rule, product decision rule.
- **Code:** the FusionContextPlan implementation (`src/engine/v11/fusion.ts` sha256 `3406397c…`) and all of `src/`; the evaluator and analysis scripts at the lock commit.

## Interpretation (declared before any Synthetic outcome)

| Outcome | Meaning |
|---|---|
| **Significant positive** (Δ > 0, CI excludes 0) | FusionContextPlan generalizes to a large unseen question population on the same corpus |
| **Null** (CI includes 0) | The EnterpriseRAG result remains valid, but the benefit of fusion is workload-dependent |
| **Significant negative** (Δ < 0, CI excludes 0) | Evidence that the current offline partner-selection and gating method is insufficiently robust |

**No outcome triggers a rerun, an alternate configuration, or any change evaluated on Synthetic.** Investigation happens only after the result is committed.

## Primary metric and decision rules (unchanged from EnterpriseRAG)

- **Primary:** FusionContextPlan − Global Fixed on Recall@5. Paired bootstrap, 10,000 resamples, seed 20261001.
- **Scientific rule:** Δ > 0 and CI excludes 0.
- **Product decision rule:** Δ ≥ +5.0 pts and CI excludes 0. This is a decision rule; it does not by itself establish a true effect ≥ 5.
- **Reported:**
  - Recall@10, nDCG@10, Success@5 (exact McNemar);
  - improves / ties / harms;
  - context tokens;
  - both / Global-only / partner-only gold contribution;
  - two-plan oracle headroom captured (diagnostic);
  - measured latency;
  - the diagnostic split;
  - resources and deviations.
- **External wording:** point estimate with paired 95% CI.

## Smoke test (280 WixQA development questions; no Synthetic data): REPRODUCED

- Global rankings matched the stored V1 outcomes on all 280 questions (0 mismatches).
- Fused Recall@5 was 0.70357, identical to the locked final fit; the gain was identical at +5.60 pts.

The evaluator refuses to run unless the lock files and `src/` are committed and unchanged, and it refuses a second test run.

## Recorded expectation

**Positive.** WixQA actual-engine out-of-fold development CV gave **+4.7 [+1.3, +8.2]**. The final-fit training gain of +5.6 is in-sample.

Caveat: Synthetic questions are LLM-generated, with exactly one gold article each, so their distribution differs from the development questions.

## Operational

Keep the machine awake during the run. An OS sleep pauses the run without affecting quality results. If a sleep overlaps the latency pass, that is recorded as a deviation.
