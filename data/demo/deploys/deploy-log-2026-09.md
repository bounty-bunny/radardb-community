---
title: Production deploy log — September 2026
source: deployctl
updated: 2026-09-29
---
# Production deploy log — September 2026

| Deploy | Date (UTC) | Service | Version | Author | Approver | Status | Change |
|---|---|---|---|---|---|---|---|
| DEP-1174 | 2026-09-02 10:12 | payments-api | v2.7.4 | Marcus Webb | Tom Okafor | success | bump stripe sdk to 14.2 |
| DEP-1176 | 2026-09-03 14:30 | cart-svc | v3.9.0 | Daniel Kim | Priya Nair | success | persist cart notes |
| DEP-1179 | 2026-09-08 11:05 | payments-api | v2.8.0 | Tom Okafor | Marcus Webb | success | payments.retry_v2 behind flag |
| DEP-1181 | 2026-09-09 09:40 | pricing-svc | v5.2.0 | Jonas Weber | Mei Tanaka | success | promotion rule engine cache |
| DEP-1183 | 2026-09-10 16:20 | inventory-svc | v6.1.2 | Mei Tanaka | Jonas Weber | success | reservation metrics |
| DEP-1185 | 2026-09-11 13:00 | edge-gateway | v1.30.0 | Sofia Alvarez | Raj Patel | success | HTTP/3 for mobile |
| DEP-1187 | 2026-09-14 14:55 | checkout-svc | v4.12.0 | Daniel Kim | Priya Nair | rolled back | stacked promotions in cart summary |
| DEP-1188 | 2026-09-14 15:31 | checkout-svc | v4.11.3 | Lena Chen | Priya Nair | success | rollback of DEP-1187 |
| DEP-1190 | 2026-09-16 10:45 | checkout-svc | v4.12.1 | Daniel Kim | Priya Nair | success | batch promotion lookup (PR #3342) |
| DEP-1192 | 2026-09-22 08:15 | orders-schema | v7 | Aisha Bello | Lena Chen | success | add gift_options to order.created |
| DEP-1193 | 2026-09-22 12:02 | notification-worker | v3.4.1 | Aisha Bello | Omar Haddad | success | dead-letter queue for poison messages |
| DEP-1195 | 2026-09-24 15:10 | checkout-svc | v4.13.0 | Priya Nair | Lena Chen | success | address autocomplete to 50% |
| DEP-1197 | 2026-09-29 10:30 | payments-api | v2.8.2 | Marcus Webb | Tom Okafor | success | soft decline retry tuning |
