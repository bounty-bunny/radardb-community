---
title: "Runbook — flushing the pricing promotion cache"
source: confluence
updated: 2026-06-30
---
# Runbook: flushing the pricing promotion cache

## When to use
Promotion changes made in the admin tool do not show up at checkout after 5 minutes.

## Steps
1. Flush one pod at a time with `pricingctl cache flush --pod <pod>`.
2. Do not flush all pods at once; that caused a cache stampede in the past.
3. Confirm the new promotion with a test cart in staging first.
