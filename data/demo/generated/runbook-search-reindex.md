---
title: "Runbook — search reindex"
source: confluence
updated: 2026-06-30
---
# Runbook: search reindex

## Steps
1. Trigger the reindex job with `searchctl reindex --throttle 200`.
2. Reindex outside business hours; it reads every product from catalog-svc.
3. Swap the alias only after document counts match.

## Rolling back
Point the products alias back to the previous index with `searchctl alias set products <old-index>`.
