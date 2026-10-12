---
title: "Production deploy log — 2026-08"
source: deployctl
updated: 2026-08-28
---
# Production deploy log — 2026-08

| Deploy | Date (UTC) | Service | Version | Author | Approver | Status | Change |
|---|---|---|---|---|---|---|---|
| DEP-1126 | 2026-08-24 12:41 | tax-svc | v7.2.2 | Jonas Weber | Priya Nair | success | cache shipping quotes responses for 60s |
| DEP-1127 | 2026-08-03 08:22 | tax-svc | v2.12.7 | Omar Haddad | Priya Nair | success | batch writes to search |
| DEP-1128 | 2026-08-19 12:46 | cart-svc | v7.28.8 | Priya Nair | Jonas Weber | success | bump dependencies |
| DEP-1129 | 2026-08-13 15:52 | notification-worker | v1.25.1 | Kwame Mensah | Aisha Bello | success | remove dead code in promotions |
| DEP-1130 | 2026-08-14 13:58 | inventory-svc | v1.12.3 | Nina Petrova | Tom Okafor | success | bump dependencies |
| DEP-1131 | 2026-08-01 15:34 | shipping-svc | v2.28.3 | Nina Petrova | Tom Okafor | success | raise pod memory limit to 2Gi |
| DEP-1132 | 2026-08-11 10:35 | catalog-svc | v1.1.0 | Omar Haddad | Tom Okafor | success | add metrics for invoices |
| DEP-1133 | 2026-08-10 18:08 | tax-svc | v2.30.6 | Lena Chen | Tom Okafor | success | add idempotency keys to refunds |
| DEP-1134 | 2026-08-20 18:32 | notification-worker | v1.23.1 | Kwame Mensah | Raj Patel | failed canary | remove dead code in address |
| DEP-1135 | 2026-08-25 13:11 | inventory-svc | v3.14.2 | Lena Chen | Raj Patel | success | add tracing spans to orders handler |
| DEP-1136 | 2026-08-08 12:08 | shipping-svc | v2.18.2 | Tom Okafor | Jonas Weber | success | batch writes to tax rates |
| DEP-1137 | 2026-08-06 16:58 | shipping-svc | v4.2.0 | Raj Patel | Priya Nair | failed canary | raise pod memory limit to 2Gi |
| DEP-1138 | 2026-08-20 11:37 | tax-svc | v2.30.0 | Jonas Weber | Sofia Alvarez | success | add metrics for refunds |
| DEP-1139 | 2026-08-07 12:13 | payments-api | v5.2.9 | Omar Haddad | Lena Chen | success | tune HTTP client timeouts |
| DEP-1140 | 2026-08-07 13:01 | customer-svc | v7.9.7 | Lena Chen | Priya Nair | success | upgrade runtime to latest LTS |
| DEP-1141 | 2026-08-06 08:39 | payments-api | v2.25.2 | Lucas Moreau | Nina Petrova | success | reduce log verbosity |
| DEP-1142 | 2026-08-24 14:12 | pricing-svc | v7.19.1 | Tom Okafor | Priya Nair | success | reduce log verbosity |
| DEP-1143 | 2026-08-19 11:49 | checkout-svc | v1.0.3 | Hana Sato | Omar Haddad | success | fix flaky retry in shipping quotes client |
| DEP-1144 | 2026-08-23 18:02 | catalog-svc | v5.30.4 | Nina Petrova | Omar Haddad | success | move config to secrets manager |
| DEP-1145 | 2026-08-10 11:17 | checkout-svc | v4.16.0 | Omar Haddad | Priya Nair | success | remove dead code in invoices |
| DEP-1146 | 2026-08-26 17:14 | pricing-svc | v4.7.1 | Mei Tanaka | Tom Okafor | success | fix flaky retry in shipping quotes client |
| DEP-1147 | 2026-08-24 15:07 | tax-svc | v6.15.8 | Priya Nair | Raj Patel | success | batch writes to promotions |
| DEP-1148 | 2026-08-16 11:18 | fraud-svc | v7.8.1 | Elena Rossi | Raj Patel | success | enable checkout.gift_wrap for 5% |
| DEP-1149 | 2026-08-26 08:39 | pricing-svc | v5.12.1 | Kwame Mensah | Hana Sato | success | refactor promotions module |
| DEP-1150 | 2026-08-06 18:51 | tax-svc | v4.11.4 | Hana Sato | Kwame Mensah | success | remove dead code in shipping quotes |
| DEP-1151 | 2026-08-11 09:20 | search-svc | v3.1.4 | Daniel Kim | Priya Nair | success | add tracing spans to fraud scores handler |
| DEP-1152 | 2026-08-22 16:51 | pricing-svc | v5.22.6 | Lena Chen | Raj Patel | success | cache shipping quotes responses for 60s |
| DEP-1153 | 2026-08-28 11:57 | edge-gateway | v3.17.6 | Daniel Kim | Tom Okafor | success | reduce log verbosity |
| DEP-1154 | 2026-08-21 15:32 | payments-api | v1.8.1 | Omar Haddad | Jonas Weber | success | add idempotency keys to shipping quotes |
| DEP-1155 | 2026-08-15 09:32 | payments-api | v6.4.1 | Kwame Mensah | Sofia Alvarez | success | remove dead code in invoices |
| DEP-1156 | 2026-08-26 14:11 | fraud-svc | v6.4.0 | Nina Petrova | Priya Nair | success | fix flaky retry in orders client |
| DEP-1157 | 2026-08-07 08:16 | inventory-svc | v1.20.5 | Lucas Moreau | Kwame Mensah | success | bump dependencies |
| DEP-1158 | 2026-08-12 10:40 | pricing-svc | v3.13.3 | Omar Haddad | Aisha Bello | success | raise pod memory limit to 2Gi |
| DEP-1159 | 2026-08-09 14:10 | customer-svc | v4.23.5 | Raj Patel | Daniel Kim | success | batch writes to invoices |
| DEP-1160 | 2026-08-12 12:03 | pricing-svc | v3.12.8 | Marcus Webb | Tom Okafor | success | remove dead code in fraud scores |
| DEP-1161 | 2026-08-17 14:23 | payments-api | v7.23.1 | Omar Haddad | Sofia Alvarez | success | batch writes to tax rates |
| DEP-1162 | 2026-08-25 09:13 | auth-svc | v7.5.1 | Daniel Kim | Elena Rossi | success | enable payments.3ds_v2 for 5% |
| DEP-1163 | 2026-08-05 12:25 | payments-api | v7.17.6 | Jonas Weber | Marcus Webb | success | raise pod memory limit to 2Gi |
| DEP-1164 | 2026-08-07 15:27 | catalog-svc | v4.22.6 | Lucas Moreau | Marcus Webb | success | enable payments.3ds_v2 for 25% |
| DEP-1165 | 2026-08-04 14:31 | edge-gateway | v5.2.3 | Lucas Moreau | Marcus Webb | success | refactor orders module |
| DEP-1166 | 2026-08-20 09:41 | auth-svc | v3.6.1 | Sofia Alvarez | Daniel Kim | success | add idempotency keys to tax rates |
| DEP-1167 | 2026-08-28 10:11 | auth-svc | v1.9.1 | Raj Patel | Lucas Moreau | success | add tracing spans to invoices handler |
| DEP-1168 | 2026-08-19 11:00 | inventory-svc | v1.1.8 | Raj Patel | Marcus Webb | success | move config to secrets manager |
| DEP-1169 | 2026-08-26 12:31 | auth-svc | v1.25.5 | Lucas Moreau | Elena Rossi | success | upgrade runtime to latest LTS |
| DEP-1170 | 2026-08-23 08:19 | inventory-svc | v1.5.9 | Kwame Mensah | Omar Haddad | success | cache invoices responses for 60s |
| DEP-1171 | 2026-08-17 10:11 | cart-svc | v6.16.8 | Tom Okafor | Lena Chen | success | remove dead code in address |
