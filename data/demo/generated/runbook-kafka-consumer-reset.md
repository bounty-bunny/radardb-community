---
title: "Runbook — resetting a Kafka consumer group"
source: confluence
updated: 2026-06-30
---
# Runbook: resetting a Kafka consumer group

## When to use
Only when a consumer group is stuck and skipping messages is acceptable, for example analytics consumers.

## Steps
1. Scale the consumer deployment to zero.
2. Run `kafka-consumer-groups --group <group> --reset-offsets --to-latest --execute`.
3. Scale the deployment back up and watch lag.

## Never
Never reset notification-worker offsets without Team Hermes: skipped messages mean customers never get emails.
