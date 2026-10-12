# WixQA Synthetic test: execution record and deviations

The locked test ran once under lock `a67c294` (the evaluator's integrity gates passed). It started 2026-10-06 17:36:58 CDT and finished at 22:45:28 CDT. Exit 0; stderr empty. Raw result: `results/synthetic-test.json`; analysis output: `WIXQA_SYNTHETIC_RESULTS.md` (produced by the locked `synthetic-analyze.ts`, unmodified).

## Deviations (execution only; none touch the sample, plans, parameters, code or statistics)

1. **OS sleep during the quality pass.**
   - Kernel-Power events record a suspend around 18:37 and Modern Standby until 21:27 (events 107 / 506 / 507), despite the runner's process-level keep-awake request (`SetThreadExecutionState`).
   - The run paused and resumed. Quality results are deterministic (caches on) and unaffected.
   - **Quality-pass wall clock was 17,739 s, against a PRE-RUN projection of about 5,660 s.** The 2 h evaluation budget was exceeded in wall-clock time because of the pause plus the contention below.
   - The run was not stopped: stopping after exposure would have spent the population with no result, and the lock gives no hard stop.
2. **CPU contention.**
   - During roughly the first 1,000 questions, total CPU was at 100% and only 2 GB of RAM was free; browsers and Windows Defender were competing for the machine.
   - Questions 500–1,000 took 24.5 min, against 11 min before and after.
   - This affects runtime only.
3. **Latency pass.**
   - It ran 22:32–22:45 CDT. No sleep events were recorded after 21:30.
   - Background contention during the pass was not measured, so latency figures are as measured on a shared laptop.

No rerun, no alternate configuration and no change of any kind followed the result.
