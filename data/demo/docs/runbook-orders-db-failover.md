---
title: Runbook — orders-db failover
source: confluence
updated: 2026-05-27
---
# Runbook: orders-db failover

## Symptoms
Write errors from checkout-svc, `could not connect to server` in PgBouncer logs, or the Patroni leader missing from `patronictl list`.

## Before you fail over
Check replication lag on the replicas. Only promote a replica whose replication lag is below 5 seconds; otherwise you risk losing committed orders. Our recovery point objective for orders-db is 5 seconds and the recovery time objective is 15 minutes.

## Planned switchover
Run `patronictl switchover orders-db --candidate <replica> --force` during low traffic. PgBouncer follows the leader through the orders-db-rw DNS record, so no config change is needed.

## Unplanned failover
If the leader is unreachable for more than 30 seconds Patroni fails over automatically. Verify the new leader with `patronictl list`, then restart PgBouncer pods with `kubectl rollout restart deploy/pgbouncer-orders -n data` to drop stale server connections.

## Afterwards
Page the database on-call (Team Data) and open a Sev2 incident even if the failover was automatic.
