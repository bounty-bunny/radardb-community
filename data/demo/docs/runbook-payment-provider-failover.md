---
title: Runbook — Payment provider failover (Stripe to Adyen)
source: confluence
updated: 2026-09-05
---
# Runbook: payment provider failover

## Trigger
Fail over to Adyen when Stripe authorization errors exceed 5% for 3 consecutive minutes, or when Stripe declares a major incident on their status page.

## Procedure
1. Get approval from the payments incident commander (currently required, see PAY-341).
2. Enable the flag payments.provider.fallback with `flagctl enable payments.provider.fallback --env prod`.
3. Confirm that new authorizations show provider=adyen in the payments dashboard.
4. Saved cards tokenized with Stripe cannot be charged through Adyen; those customers are asked to re-enter their card.

## Failing back
Fail back to Stripe only after 30 minutes of healthy Stripe status, using `flagctl disable payments.provider.fallback --env prod`.
