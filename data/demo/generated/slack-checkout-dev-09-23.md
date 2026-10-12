---
title: "#checkout-dev — 2026-09-23"
source: slack
updated: 2026-09-23
---
# #checkout-dev — 2026-09-23

09:32 Priya Nair: heads up: Stripe sandbox is flaky this morning
10:01 Elena Rossi: we should add a query-count check to edge-gateway too
10:40 Mei Tanaka: PgBouncer stats look normal on payments-api today
11:20 Jonas Weber: anyone else seeing elevated p99 on catalog-svc? looks like a noisy neighbour
11:58 Aisha Bello: heads up: Stripe sandbox is flaky this morning
12:21 Aisha Bello: staging is broken again, catalog-svc cannot reach the database
12:25 Sofia Alvarez: we should add a query-count check to customer-svc too
13:04 Kwame Mensah: PgBouncer stats look normal on payments-api today
13:17 Raj Patel: reminder: use flagctl, not the LaunchDarkly UI, so changes are audited
13:48 Kwame Mensah: staging is broken again, tax-svc cannot reach the database
14:19 Kwame Mensah: staging is broken again, pricing-svc cannot reach the database
14:32 Aisha Bello: postmortem review moved to Friday
14:39 Tom Okafor: staging is broken again, catalog-svc cannot reach the database
14:47 Lena Chen: who owns the fraud-svc dashboards now that the team split?
