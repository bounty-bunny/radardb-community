---
title: Alert catalogue — checkout platform
source: confluence
updated: 2026-09-19
---
# Alert catalogue

## CheckoutLatencyHigh
Fires when checkout p99 latency at edge-gateway exceeds 800 ms for 10 minutes. Severity: Sev2. First check recent deploys with `deployctl history --service checkout-svc`.

## PaymentErrorRateHigh
Fires when payment authorization errors exceed 2% for 5 minutes. Severity: Sev1 if above 10%.

## OrdersDbPoolSaturation
Added on 2026-09-19 as a follow-up to INC-2041 (ticket CHK-883). Fires when PgBouncer pool utilization for checkout exceeds 85% for 5 minutes.

## NotificationConsumerLag
Fires when notification-worker consumer lag on the orders topic exceeds 50,000 messages.

## InventoryReservationFailures
Fires when more than 1% of reservation attempts fail over 10 minutes.
