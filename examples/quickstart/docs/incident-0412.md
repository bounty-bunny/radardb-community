# Incident report INC-0412: delayed notifications

## Summary
On 12 April, email and mobile notifications were delayed by up to 47 minutes for workspaces in the EU region.

## Root cause
A configuration change reduced the notification queue's worker pool from 24 to 4 workers. The queue backlog grew faster than it could be processed.

## Fix
The worker pool was restored and an alert now fires when queue latency exceeds 5 minutes.
