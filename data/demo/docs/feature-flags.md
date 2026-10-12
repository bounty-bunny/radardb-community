---
title: Feature flag conventions
source: confluence
updated: 2026-08-14
---
# Feature flags

Flags are managed with flagctl and stored in LaunchDarkly. Names follow <domain>.<feature>.

## Rules
- Every new user-facing feature ships dark behind a flag.
- Kill-switch flags must default to off and be documented here.
- Flags older than 90 days at 100% must be removed (tracked by the flag-janitor bot).

## Active flags
| Flag | Owner | Rollout | Notes |
|---|---|---|---|
| checkout.one_click | Team Falcon | 100% | remove after Q4 freeze |
| checkout.address_autocomplete | Team Falcon | 50% | rollout tracked in CHK-870 |
| checkout.stacked_promotions | Team Falcon | 100% | shipped with PR #3318 |
| payments.retry_v2 | Team Ledger | 25% | exponential backoff for soft declines |
| payments.provider.fallback | Team Ledger | 0% | kill switch: routes authorizations to Adyen |
