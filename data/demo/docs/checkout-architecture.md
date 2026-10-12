---
title: Checkout platform architecture
source: confluence
updated: 2026-07-02
---
# Checkout platform architecture

## Overview
The checkout platform turns a cart into a paid order. A request enters through edge-gateway, is authenticated, and is routed to checkout-svc, which orchestrates cart-svc, pricing-svc, inventory-svc and payments-api. Orders are persisted in orders-db, a PostgreSQL 16 cluster managed by Patroni, and an order.created event is published to the orders Kafka topic.

## Services and owners
| Service | Owner team | Tech lead | Language | Tier |
|---|---|---|---|---|
| edge-gateway | Team Platform | Sofia Alvarez | Go | Tier 0 |
| checkout-svc | Team Falcon | Priya Nair | TypeScript | Tier 0 |
| cart-svc | Team Falcon | Priya Nair | TypeScript | Tier 1 |
| pricing-svc | Team Atlas | Jonas Weber | Kotlin | Tier 1 |
| inventory-svc | Team Atlas | Jonas Weber | Kotlin | Tier 0 |
| payments-api | Team Ledger | Marcus Webb | Java | Tier 0 |
| notification-worker | Team Hermes | Aisha Bello | Python | Tier 2 |

## Request flow
1. edge-gateway validates the session token against redis-sessions.
2. checkout-svc loads the cart from cart-svc and asks pricing-svc for line prices and promotions.
3. inventory-svc reserves stock with a 10 minute reservation hold.
4. payments-api authorizes the card with Stripe, the primary payment provider. Adyen is the fallback provider.
5. checkout-svc writes the order to orders-db and publishes order.created.
6. notification-worker consumes order.created and sends the order confirmation email.

## Service level objectives
Checkout availability target is 99.95% per rolling 28 days. Checkout latency SLO: p99 below 800 ms measured at edge-gateway. Payment authorization success rate must stay above 98%.

## Dependencies and data stores
orders-db is the system of record for orders. checkout-svc connects to orders-db through PgBouncer in transaction pooling mode. Session data lives in redis-sessions with a 30 minute TTL. pricing-svc reads promotion rules from the promotions schema in orders-db, which means slow promotion queries compete with order writes for the same connection pool.
