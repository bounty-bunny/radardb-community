# ADR 0005: No telemetry in the community edition

- **Status:** Accepted
- **Date:** 2026-10-11

## Decision

The community edition collects and sends **no** usage data: no analytics, crash reporting, update checks, or license checks. The only outbound network access is the one-time model download from the Hugging Face Hub. `radar doctor` states this explicitly.

Business metrics (installations, first successful evaluation, repeat use, cloud activation, conversion, retention) are measured from sources that need no hidden collection:

- package registry download counts and GitHub stars/clones (aggregate, public);
- documentation analytics on our own website;
- cloud sign-ups and usage, which happen inside the commercial service under its own terms;
- an **opt-in** `radar feedback` survey, if ever added. It would be off by default, show exactly what it sends, and need a separate ADR.

## Rationale

The product handles private documents. Silent telemetry would break the trust the open-source edition exists to build, and would complicate enterprise security review.
