---
title: "#inc-war-room — 2026-09-14 (INC-2041)"
source: slack
updated: 2026-09-14
---
# #inc-war-room — 2026-09-14

14:58 PagerDuty: CheckoutLatencyHigh triggered for checkout-svc (p99 1.9 s)
15:07 Lena Chen: I'm IC. Anything deployed in the last hour?
15:09 Priya Nair: DEP-1187 went out at 14:55, checkout-svc v4.12.0, stacked promotions.
15:14 Daniel Kim: traces show 41 queries per checkout, mostly getPromotions. That's my PR.
15:18 Team Data: PgBouncer checkout pool is at 97%, order writes are queueing.
15:22 Lena Chen: decision: roll back to v4.11.3, we'll fix forward later.
15:31 Lena Chen: deployctl rollback --service checkout-svc --to v4.11.3 --reason "DEP-1187" started
15:42 Lena Chen: p99 back to 640 ms. Rollback complete, monitoring.
15:50 Lena Chen: postmortem owner: Daniel Kim, due 2026-09-21.
