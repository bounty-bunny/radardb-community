# EnterpriseRAG-Bench — status (frozen RadarDB V1 validation)

**Frozen 10K feasibility result: commit `beec1ce`. Not to be rerun or modified.**

## Finding

**10K EnterpriseRAG: RESOURCE_LIMIT_FAILURE / EMBEDDING_TIME_LIMIT**

Frozen RadarDB V1 could not construct its full candidate representation search space for the 10K EnterpriseRAG corpus within the preregistered 2-hour representation budget on the validation hardware. Ingestion succeeded, but representation construction exceeded the budget before cache serialization or optimizer search.

This is **not** a finding that "RadarDB cannot scale to 10K documents". It is a measured budget failure of V1's exhaustive representation construction on this hardware.

| Measurement | Value |
|---|---|
| Ingestion | 10,000 docs / 49.3M chars / 81 s |
| fixed-512 | 24,360 vectors / 1,248 s |
| fixed-256 | 45,213 / 2,280 s |
| section-aware | 31,869 / 2,214 s |
| sentence-window | incomplete after 1,384 s |
| First 3 representations | 101,442 vectors / 5,742 s |
| Maximum RSS (sampled every 5 s by watchdog) | 5,168 MB |
| Maximum JS heap observed at instrumentation events | 2,705 MB |
| Cache serialization | not reached |
| Optimizer | not reached |
| Held-out labels read | 0 |

- **Projected cache serialization problem: UNTESTED.** The pre-run projection (654.0M-char embedding-cache JSON vs `MAX_STRING_LENGTH` 536.9M) was never exercised. No V8 string-serialization failure occurred or is claimed.
- Environment limitation: shared laptop, 2.4 GB free RAM at the pre-run check (DEVIATIONS.md). Not used to invalidate the run.

## Dataset status

- **The preregistered primary EnterpriseRAG result is unavailable**, because the smallest eligible primary scale (10K; gold density ≤ 10%) failed feasibility.
- The completed **2K run** (`5efd6ad`) remains available as a **secondary / V1 product-constrained** experiment. Its comparative evaluation has **not** been run and is on hold.
