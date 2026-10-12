---
title: "Runbook — TLS certificate rotation"
source: confluence
updated: 2026-06-30
---
# Runbook: TLS certificate rotation

## Steps
1. Check expiry with `kubectl get certificates -A`.
2. Force renewal with `cmctl renew <certificate> -n <namespace>`.
3. If renewal fails, check the ACME account secret and the ClusterIssuer events.

## Escalation
Page Team Platform if a Tier 0 certificate expires within 72 hours and cannot be renewed.
