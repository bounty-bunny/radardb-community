---
title: Release process and change freeze
source: confluence
updated: 2026-09-01
---
# Release process

## Release trains
Tier 0 services deploy on release trains on Tuesday and Thursday. Hotfixes can ship any day with IC approval.

## Canary
Every deploy starts with a canary at 5% of traffic for 30 minutes. deployctl automatically rolls back the canary if error rate exceeds 1% or p99 latency regresses by more than 25% against the stable fleet.

## Change freeze
The peak season change freeze runs from November 20 to December 2. During the freeze only Sev1 fixes approved by the VP of Engineering may be deployed.

## Approvals
Each production deploy requires an approver from the owning team. The approver is recorded in the deploy log.
