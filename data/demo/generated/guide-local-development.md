---
title: "Guide — local development for checkout"
source: confluence
updated: 2026-06-30
---
# Local development for checkout

## Setup
Run `make dev` to start checkout-svc, cart-svc and a local Postgres with seeded carts. Stripe and Adyen are replaced by a fake payment provider.

## Tests
Run `make test` for unit tests and `make itest` for integration tests against Docker.

## Feature flags locally
Flags default to their production values. Override with `FLAG_OVERRIDES=checkout.one_click=false make dev`.
