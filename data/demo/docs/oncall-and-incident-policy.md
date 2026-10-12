---
title: On-call and incident management policy
source: confluence
updated: 2026-04-11
---
# On-call and incident management policy

## Severity levels
- Sev1: checkout or payments unavailable, or data loss. Page immediately.
- Sev2: degraded checkout (SLO burn), partial outage of a Tier 0 service.
- Sev3: Tier 1/2 degradation with a workaround.

## Response expectations
The primary on-call must acknowledge a Sev1 page within 5 minutes. If not acknowledged, PagerDuty escalates to the secondary after 5 minutes and to the engineering manager after 15 minutes. Every Sev1 and Sev2 gets an incident commander (IC) from the IC rotation.

## Communication
Incident coordination happens in the #inc-war-room Slack channel. The IC posts status page updates every 30 minutes for customer-facing incidents.

## Postmortems
A blameless postmortem is required for every Sev1 and Sev2. The postmortem is due within 5 business days and must list follow-up tickets with owners.
