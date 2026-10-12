# RadarDB security model

*V1 is a local, single-user tool. This document separates what is enforced today from what enterprise deployments will require.*

## Threats in scope

1. Network exposure of the control plane (reading every document, deploying plans, wiping state).
2. Malicious input to the API (oversized payloads, malformed JSON, unexpected fields).
3. Path traversal through the filesystem connector.
4. Untrusted document content: XSS in the console, and prompt injection into the customer's LLM.
5. Secret leakage through frontend state, logs or traces.
6. Sensitive document content persisting in logs.

## Enforced today

| Control | Where | Detail |
|---|---|---|
| Localhost binding | `package.json` scripts | `next dev/start -H 127.0.0.1`. Found by the audit: `next dev` previously listened on every interface |
| Control-plane host check | `src/server/http.ts` `guardControl` | Requests must target `localhost`/`127.0.0.1`/`::1`, otherwise 403. Also blocks DNS rebinding. Opt-out: `RADAR_ALLOW_REMOTE=1` |
| Data-plane API key | `guardData` | If `RADAR_API_KEY` is set, `Authorization: Bearer` is required (constant-time compare); otherwise the data plane is local-only |
| Input validation | `src/server/schemas.ts` (zod, strict) | query ≤ 2 000 chars; uploads ≤ 1 M chars; bodies ≤ 25 MB; benchmark ≤ 2 000 docs / 20 M chars / 500 questions; unknown fields rejected; typed error codes, no stack traces |
| Path confinement | `connectors/filesystem.ts` `resolveInside` | Rejects absolute paths, drive letters, `..` escapes and symlinks resolving outside the root; skips symlinked entries, dotfiles and `node_modules`; `.md/.markdown/.txt` only; 2 MB/file |
| No HTML rendering of content | console | Document text is rendered as React text nodes (`<pre>`/text), never as HTML. The only `dangerouslySetInnerHTML` is a constant theme script |
| Content is never executed | engine | Documents are tokenized, embedded and substring-matched. Nothing in a document can change routing, plan selection or system behavior |
| Untrusted-content notice | `/api/v1/context` | Responses carry `notice` telling consumers to treat context as data, not instructions |
| No secrets in the frontend | design | No credentials exist yet. `Source.connection` is documented as non-secret metadata; connectors resolve credentials server-side |
| Traces without content | `ContextRequest` | The request log stores chunk/document ids, scores and timings, never document text. Query text is logged locally by default; disable with `RADAR_LOG_QUERIES=0` |
| Read-only demo fixtures | `control.ts` | Fixture sources can't be deleted through the API |
| Data directory | `.gitignore` | `.radar/` and `sources/*` are never committed |

Verified by tests in `tests/api.test.ts` (403 for a non-local host, 401 without the key, 400 on invalid bodies, 400 on traversal paths) and by the end-to-end run in the release notes.

## Known gaps (future requirements)

| Requirement | Status |
|---|---|
| Authentication for the control plane (SSO/OIDC), roles | not built; control plane is local-only instead |
| Multi-tenant isolation | not built (single workspace) |
| Source permission propagation (ACLs on chunks, filtering by caller identity) | `Source.permissions` placeholder only. **Required before any real multi-user deployment** |
| Encryption at rest for `.radar/` (documents are stored in plain JSON) | not built; relies on OS disk encryption |
| Secret storage for connector credentials | not needed yet (no credentialed connectors); plan: env/secret manager, never persisted in state |
| Rate limiting on the data plane | not built |
| Model supply chain: pinned model revisions and checksums | models are fetched from the Hugging Face hub at first use, unpinned (audit M9) |
| Audit log of control-plane actions (who deployed what) | deploy/rollback timestamps only |
| Prompt-injection detection in retrieved content | not built; consumers are warned via `notice` |
| Retention policy for request logs and benchmark inputs | not built; files grow until deleted |
