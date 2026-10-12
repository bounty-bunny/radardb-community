---
title: "#checkout-dev — 2026-09-17"
source: slack
updated: 2026-09-17
---
# #checkout-dev — 2026-09-17

09:19 Omar Haddad: anyone else seeing elevated p99 on edge-gateway? looks like a noisy neighbour
09:59 Tom Okafor: deploying fraud-svc after lunch, ping me if the canary looks off
10:15 Daniel Kim: latency graphs for tax-svc are missing since the Grafana upgrade
10:28 Raj Patel: rollback drill is scheduled for Thursday on staging
10:58 Lucas Moreau: anyone else seeing elevated p99 on catalog-svc? looks like a noisy neighbour
11:30 Daniel Kim: we should add a query-count check to notification-worker too
11:54 Elena Rossi: we should add a query-count check to payments-api too
12:32 Nina Petrova: the pricing cache hit rate dipped to 82% overnight, investigating
13:01 Sofia Alvarez: can someone review my PR for checkout-svc? small change to retries
13:21 Tom Okafor: is the Adyen sandbox key in vault yet?
13:34 Tom Okafor: deploying search-svc after lunch, ping me if the canary looks off
