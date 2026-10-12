# ADR 0002: License for the community edition

- **Status:** Accepted: Apache-2.0 with DCO, conditional on confirming copyright ownership and licensing rights. **Not applied yet.**
- **Date:** 2026-10-11

## Requirements

Commercial redistribution by the company; a hosted commercial service built on the same engine; a patent grant to users and contributors; compatibility with all current dependencies (MIT, ISC, BSD, Apache-2.0; MPL-2.0 dev-only; LGPL-3.0 optional native binaries); a simple contribution policy; enterprise acceptability.

## Comparison

| License | Patent grant | Commercial use by others | Hosted competitors | Contributor terms | Enterprise acceptance | Notes |
|---|---|---|---|---|---|---|
| **Apache-2.0** | explicit grant + retaliation | allowed | allowed | DCO or CLA | very high | NOTICE file; standard for infrastructure |
| MIT | none explicit | allowed | allowed | DCO | very high | shortest; no patent clause |
| MPL-2.0 | explicit | allowed; file-level copyleft on modified files | allowed | DCO | high | modifications to our files stay open |
| AGPL-3.0 | explicit | allowed with network copyleft | must publish modifications | CLA needed for dual licensing | low (many enterprises ban it) | strongest anti-SaaS-competitor effect |
| BSL / ELv2 / SSPL (source-available) | varies | restricted | restricted | CLA | mixed | **not OSI open source**; would contradict "open-source developer product" |

## Recommendation

**Apache-2.0** for the public repository, with **DCO sign-off** for contributions (no CLA).

Commercial consequences:

1. **Hosted competitors.** Anyone may host RadarDB commercially. This is the accepted cost of a permissive license. Differentiation comes from the managed service (continuous optimization, connectors, governance, scale, support), not from license restrictions.
2. **No relicensing leverage.** Without a CLA, the company can't later relicense contributors' code under a closed license. Commercial features live in the private repository, so this isn't needed.
3. **Patent safety.** The explicit grant matters to enterprise buyers and to contributors.
4. **Dependency compatibility.** Apache-2.0 is compatible with every dependency in `docs/THIRD_PARTY_LICENSES.md`. MPL-2.0 (lightningcss) is build-time only. LGPL-3.0 (libvips) applies only to bundled native binaries, which must carry their license text in container images.

## To apply (after approval)

1. Add `LICENSE` (Apache-2.0 text), keep `NOTICE`, add SPDX headers to new files.
2. Change `package.json`: `"license": "Apache-2.0"`, and remove `"private": true` only when npm publication is approved.
3. Publish the DCO policy in CONTRIBUTING.md.
