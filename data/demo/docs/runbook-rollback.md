---
title: Runbook — Rolling back a service deployment
source: confluence
updated: 2026-06-18
---
# Runbook: rolling back a deployment

## When to roll back
Roll back first, investigate second. If a deploy correlates with an SLO burn (error rate or latency) within 60 minutes of release, the on-call engineer is expected to revert the release without waiting for the author.

## Steps
1. Announce in #inc-war-room that you are reverting, including the DEP id.
2. Find the previous healthy release with `deployctl history --service <name>`.
3. Run `deployctl rollback --service <name> --to <version> --reason "<DEP id>"`. Since deployctl v3 the --reason flag is mandatory.
4. Watch the canary dashboard for 10 minutes; the rollback is complete when p99 latency and error rate return to baseline.
5. Create a follow-up ticket and link it in the incident document.

## Special cases
- payments-api rollbacks require a second approval from the payments incident commander because of PCI change control.
- Database migrations are never rolled back by deployctl. All schema changes must follow the expand/contract pattern so the previous release keeps working against the new schema.
- If a feature flag caused the regression, disable the flag with flagctl instead of rolling back the binary.
