---
title: "Production deploy log — 2026-07"
source: deployctl
updated: 2026-07-28
---
# Production deploy log — 2026-07

| Deploy | Date (UTC) | Service | Version | Author | Approver | Status | Change |
|---|---|---|---|---|---|---|---|
| DEP-1080 | 2026-07-23 10:58 | auth-svc | v2.9.8 | Elena Rossi | Lucas Moreau | success | add idempotency keys to sessions |
| DEP-1081 | 2026-07-15 10:26 | fraud-svc | v7.14.4 | Lena Chen | Omar Haddad | success | fix flaky retry in address client |
| DEP-1082 | 2026-07-11 17:21 | customer-svc | v2.23.3 | Mei Tanaka | Lena Chen | success | add circuit breaker around carts |
| DEP-1083 | 2026-07-26 17:07 | edge-gateway | v1.7.8 | Sofia Alvarez | Marcus Webb | success | enable checkout.guest_upsell for 50% |
| DEP-1084 | 2026-07-28 12:19 | checkout-svc | v4.22.3 | Tom Okafor | Sofia Alvarez | success | raise pod memory limit to 2Gi |
| DEP-1085 | 2026-07-21 13:55 | edge-gateway | v5.19.5 | Tom Okafor | Aisha Bello | success | raise pod memory limit to 2Gi |
| DEP-1086 | 2026-07-01 14:15 | tax-svc | v3.30.0 | Sofia Alvarez | Lucas Moreau | success | move config to secrets manager |
| DEP-1087 | 2026-07-04 12:45 | customer-svc | v4.0.7 | Marcus Webb | Raj Patel | success | fix flaky retry in shipping quotes client |
| DEP-1088 | 2026-07-26 10:36 | shipping-svc | v5.5.8 | Tom Okafor | Hana Sato | success | add circuit breaker around shipping quotes |
| DEP-1089 | 2026-07-09 18:36 | auth-svc | v7.19.1 | Lena Chen | Daniel Kim | success | fix flaky retry in orders client |
| DEP-1090 | 2026-07-28 15:27 | inventory-svc | v7.27.3 | Kwame Mensah | Omar Haddad | success | upgrade runtime to latest LTS |
| DEP-1091 | 2026-07-21 10:28 | shipping-svc | v6.9.8 | Marcus Webb | Mei Tanaka | success | add metrics for invoices |
| DEP-1092 | 2026-07-03 13:43 | checkout-svc | v1.11.4 | Elena Rossi | Hana Sato | failed canary | reduce log verbosity |
| DEP-1093 | 2026-07-13 15:48 | customer-svc | v4.18.9 | Lena Chen | Kwame Mensah | success | upgrade runtime to latest LTS |
| DEP-1094 | 2026-07-08 17:07 | edge-gateway | v3.23.8 | Elena Rossi | Marcus Webb | success | add idempotency keys to refunds |
| DEP-1095 | 2026-07-07 12:49 | customer-svc | v7.5.5 | Raj Patel | Hana Sato | success | add tracing spans to webhooks handler |
| DEP-1096 | 2026-07-22 16:56 | tax-svc | v2.10.6 | Raj Patel | Mei Tanaka | success | reduce log verbosity |
| DEP-1097 | 2026-07-23 18:17 | checkout-svc | v1.26.2 | Nina Petrova | Lena Chen | success | add tracing spans to carts handler |
| DEP-1098 | 2026-07-14 10:52 | shipping-svc | v5.13.3 | Nina Petrova | Hana Sato | success | add idempotency keys to invoices |
| DEP-1099 | 2026-07-16 09:24 | pricing-svc | v4.11.7 | Marcus Webb | Tom Okafor | success | tune HTTP client timeouts |
| DEP-1100 | 2026-07-22 13:15 | tax-svc | v2.12.3 | Mei Tanaka | Lena Chen | failed canary | add circuit breaker around sessions |
| DEP-1101 | 2026-07-24 15:09 | tax-svc | v6.19.1 | Lena Chen | Mei Tanaka | success | add tracing spans to promotions handler |
| DEP-1102 | 2026-07-06 10:44 | auth-svc | v1.15.1 | Lena Chen | Omar Haddad | failed canary | tune HTTP client timeouts |
| DEP-1103 | 2026-07-07 15:31 | pricing-svc | v2.6.3 | Mei Tanaka | Elena Rossi | failed canary | refactor sessions module |
| DEP-1104 | 2026-07-04 10:32 | search-svc | v2.28.2 | Priya Nair | Elena Rossi | success | reduce log verbosity |
| DEP-1105 | 2026-07-28 17:56 | cart-svc | v7.22.6 | Mei Tanaka | Sofia Alvarez | success | fix flaky retry in orders client |
| DEP-1106 | 2026-07-15 17:59 | search-svc | v5.24.3 | Priya Nair | Lucas Moreau | success | bump dependencies |
| DEP-1107 | 2026-07-01 18:42 | catalog-svc | v2.13.3 | Elena Rossi | Jonas Weber | success | batch writes to shipping quotes |
| DEP-1108 | 2026-07-09 15:14 | tax-svc | v1.19.2 | Raj Patel | Tom Okafor | success | enable checkout.saved_addresses for 10% |
| DEP-1109 | 2026-07-05 09:10 | payments-api | v2.13.3 | Jonas Weber | Kwame Mensah | success | refactor sessions module |
| DEP-1110 | 2026-07-11 17:07 | notification-worker | v4.6.6 | Omar Haddad | Mei Tanaka | success | cache invoices responses for 60s |
| DEP-1111 | 2026-07-20 15:21 | catalog-svc | v3.13.9 | Aisha Bello | Omar Haddad | success | refactor address module |
| DEP-1112 | 2026-07-21 11:29 | checkout-svc | v6.5.1 | Raj Patel | Lucas Moreau | success | add idempotency keys to promotions |
| DEP-1113 | 2026-07-28 13:49 | inventory-svc | v4.11.2 | Aisha Bello | Hana Sato | success | enable checkout.express_pay for 10% |
| DEP-1114 | 2026-07-23 16:06 | fraud-svc | v1.15.5 | Marcus Webb | Tom Okafor | success | move config to secrets manager |
| DEP-1115 | 2026-07-23 11:05 | pricing-svc | v4.13.6 | Lena Chen | Daniel Kim | failed canary | add circuit breaker around carts |
| DEP-1116 | 2026-07-11 14:40 | tax-svc | v2.16.0 | Lena Chen | Omar Haddad | success | tune HTTP client timeouts |
| DEP-1117 | 2026-07-07 15:29 | auth-svc | v6.19.7 | Raj Patel | Mei Tanaka | success | reduce log verbosity |
| DEP-1118 | 2026-07-24 12:22 | edge-gateway | v5.15.5 | Tom Okafor | Nina Petrova | success | add idempotency keys to address |
| DEP-1119 | 2026-07-28 08:42 | checkout-svc | v5.7.2 | Jonas Weber | Lena Chen | success | add metrics for address |
| DEP-1120 | 2026-07-18 16:12 | cart-svc | v6.30.4 | Marcus Webb | Lena Chen | success | upgrade runtime to latest LTS |
| DEP-1121 | 2026-07-11 10:43 | search-svc | v4.0.2 | Tom Okafor | Omar Haddad | success | enable payments.3ds_v2 for 50% |
| DEP-1122 | 2026-07-06 09:12 | search-svc | v7.11.2 | Raj Patel | Mei Tanaka | success | batch writes to address |
| DEP-1123 | 2026-07-02 12:27 | auth-svc | v6.0.6 | Raj Patel | Lucas Moreau | success | fix flaky retry in carts client |
| DEP-1124 | 2026-07-20 13:21 | search-svc | v3.3.6 | Aisha Bello | Elena Rossi | success | refactor address module |
| DEP-1125 | 2026-07-08 09:25 | auth-svc | v4.23.4 | Mei Tanaka | Tom Okafor | success | remove dead code in webhooks |
