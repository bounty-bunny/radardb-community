# Contributing to RadarDB

Thanks for your interest. RadarDB is early (0.x): the most valuable contributions are bug reports with reproductions, retrieval or evaluation improvements backed by measurements, and documentation fixes.

> **Before the first public release** the license is still being chosen. Contributions cannot be accepted until a license and contribution terms are published.

## Ground rules

1. **Measure, don't assert.** Changes to retrieval, chunking, ranking or the optimizer must include before/after numbers on the bundled demo (`npm run optimize`) or a benchmark you can share, and must not weaken held-out validation.
2. **Never change evaluation definitions silently.** Splits, thresholds, metrics and benchmark definitions change only with a CHANGELOG entry and an ADR in `docs/adr/`.
3. **No telemetry, no required accounts.** The community build must keep working fully offline after the first model download.
4. **Keep the engine independent.** `src/core` and `src/engine` must not import the server, UI or Next.js (enforced by `tests/api-surface.test.ts`).
5. **Public API changes** (exports of `src/engine/index.ts`, `schemas/`, `/api/v1/*`) need a CHANGELOG entry; the API-surface test pins the export list.

## Development

```bash
npm install
npm run typecheck
npm test            # vitest; no network needed except the first model download for engine tests
npm run build
npm run dev         # http://127.0.0.1:3000
```

Use synthetic or properly licensed data only. Never commit customer data, credentials or benchmark datasets (`.radar/`, `sources/*` and `validation/data/` are git-ignored).

## Pull requests

- One focused change per PR, with tests.
- Describe what changed, why, and how you measured it.
- Update docs when behavior changes; mark features IMPLEMENTED / EXPERIMENTAL / PLANNED honestly.
- CI must pass: typecheck, tests, build, secret scan and dependency-license check.

## Commit sign-off

Contributions are accepted under the [Developer Certificate of Origin 1.1](https://developercertificate.org/) (DCO). There is no contributor license agreement (CLA). By adding a `Signed-off-by` line to a commit, you certify that you wrote the change or otherwise have the right to submit it under the project license, Apache-2.0.

```bash
git commit -s -m "Describe the change"     # adds: Signed-off-by: Your Name <you@example.com>
git commit --amend -s --no-edit            # sign off the last commit
git rebase --signoff main                  # sign off every commit on a branch
```

Every commit in a pull request needs a sign-off matching its author. Use a real name or a consistent public identity, and an address you are happy to publish (GitHub's `<id>+<user>@users.noreply.github.com` works). Inbound contributions are licensed under Apache-2.0, as section 5 of the license provides.
