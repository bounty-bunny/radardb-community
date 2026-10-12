---
title: "#checkout-dev — 2026-09-29"
source: slack
updated: 2026-09-29
---
# #checkout-dev — 2026-09-29

09:10 Elena Rossi: anyone else seeing elevated p99 on auth-svc? looks like a noisy neighbour
09:14 Lena Chen: rollback drill is scheduled for Thursday on staging
09:20 Elena Rossi: latency graphs for tax-svc are missing since the Grafana upgrade
09:48 Omar Haddad: the pricing cache hit rate dipped to 82% overnight, investigating
10:01 Priya Nair: latency graphs for auth-svc are missing since the Grafana upgrade
10:08 Marcus Webb: we should add a query-count check to search-svc too
10:39 Sofia Alvarez: rollback drill is scheduled for Thursday on staging
10:50 Hana Sato: the pricing cache hit rate dipped to 82% overnight, investigating
11:05 Raj Patel: is the Adyen sandbox key in vault yet?
11:24 Mei Tanaka: reminder: use flagctl, not the LaunchDarkly UI, so changes are audited
11:59 Mei Tanaka: staging is broken again, catalog-svc cannot reach the database
12:39 Lena Chen: staging is broken again, payments-api cannot reach the database
