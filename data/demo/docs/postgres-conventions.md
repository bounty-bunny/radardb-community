---
title: PostgreSQL conventions
source: confluence
updated: 2026-03-02
---
# PostgreSQL conventions

## Connection pooling
All services connect through PgBouncer in transaction pooling mode. checkout-svc uses default_pool_size = 40 and max_client_conn = 2000.

## Timeouts
statement_timeout is 2s for OLTP services; long reports must use the read replica.

## Query patterns
Avoid N+1 queries: load related rows in one query with WHERE id = ANY($1). Every new endpoint must have a query-count assertion in its integration test.

## Indexes
Create indexes CONCURRENTLY. Migrations that take an ACCESS EXCLUSIVE lock on orders tables are forbidden during business hours.
