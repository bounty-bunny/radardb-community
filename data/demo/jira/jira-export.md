---
title: Jira export — CHK, PAY, INV, NOT projects
source: jira
updated: 2026-09-29
---
# Jira export (open and recently closed issues)

## CHK-882: Add query-count regression test to checkout-svc CI
Status: In Progress · Assignee: Daniel Kim · Priority: High · Linked: INC-2041
Fail the build when an endpoint issues more than 10 queries per request in integration tests.

## CHK-883: Alert on PgBouncer pool saturation
Status: Done · Assignee: Lena Chen · Linked: INC-2041
Implemented as the OrdersDbPoolSaturation alert (85% for 5 minutes).

## CHK-870: Roll out address autocomplete
Status: In Progress · Assignee: Priya Nair
checkout.address_autocomplete is at 50%. Go to 100% after conversion data review on October 6.

## PAY-341: Automate payment provider failover
Status: To Do · Assignee: Marcus Webb · Priority: Highest · Target: Q4 2026 · Linked: INC-2017
Enable payments.provider.fallback automatically when Stripe errors exceed 5% for 3 minutes, without waiting for IC approval.

## PAY-342: Secondary approver for payments IC rotation
Status: Done · Assignee: Tom Okafor · Linked: INC-2017

## INV-127: Load test reservations at 5x flash sale traffic
Status: To Do · Assignee: Jonas Weber · Linked: INC-1988

## NOT-58: Schema compatibility check for orders topic
Status: In Progress · Assignee: Aisha Bello · Linked: INC-2055
Run the Confluent schema registry compatibility check (BACKWARD) in CI for every change to the orders topic.
