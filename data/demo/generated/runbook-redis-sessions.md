---
title: "Runbook — redis-sessions failover"
source: confluence
updated: 2026-06-30
---
# Runbook: redis-sessions failover

## Symptoms
Shoppers are logged out, or edge-gateway logs show READONLY errors from redis-sessions.

## Steps
1. Check sentinel status with `redis-cli -p 26379 sentinel masters`.
2. If the primary is down for more than 20 seconds, sentinel promotes a replica automatically.
3. Restart edge-gateway pods only if they keep connecting to the old primary.

## Notes
Sessions are not replicated across regions. A regional failover logs every shopper out.
