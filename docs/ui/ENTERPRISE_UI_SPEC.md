# Enterprise UI specification (PLANNED, not built)

Builds on the Cloud UI. **None of this exists.**

## Organization and access

### Members and roles

| Role | Can |
|---|---|
| Owner | everything, including billing, SSO and deletion |
| Admin | members, policies, connections, deploy approval |
| Engineer | run evaluations, propose releases, shadow tests |
| Viewer | read dashboards and reports |
| Auditor | read audit events and evidence; no data access |

Members table: name, email, role (dropdown, admin-only), source (SSO / SCIM / invite), last active. SCIM-managed members show the role as read-only, with "managed by your identity provider".

### SSO

A SAML/OIDC setup wizard: metadata upload or URL → attribute mapping → test login → enforce (with a break-glass owner account). The enforcement toggle is disabled until a successful test login, and the reason is shown inline.

## Governance

### Deployment policies

```
Policy: Production deploys
  Require: [✓] held-out improvement CI excludes 0   [✓] p95 latency ≤ [ 800 ] ms   [✓] approval by [ Admin ▾ ] (2 approvers)
  Auto-deploy from schedules: ( ) allowed  (•) proposal only
```

A release detail page shows a policy checklist with pass/fail per rule and the evidence link. The deploy button is enabled only when every rule passes, and the reason is listed when it is not.

### Audit events

A filterable, exportable log (CSV/JSON): actor, action (deploy, rollback, policy change, connection change, role change, export), target, before/after, IP, timestamp. Retention is per contract. Read-only, including for owners.

### Shared dashboards

Org-wide: workspaces × held-out quality trend, latency, cost per 1K queries, open alerts, pending approvals. Every tile links to the underlying evaluation.

## Support

An in-app support panel with the contract tier, case list and status page link. Opening a case attaches a **redacted** diagnostic bundle (manifest, versions, error codes; no document content) only after explicit confirmation.

## Requirements

The same accessibility, responsiveness and state-handling rules as the Cloud UI. Every governance control reflects real enforcement in the backend: no UI-only policies.
