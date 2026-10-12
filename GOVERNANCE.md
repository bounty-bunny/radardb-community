# Governance

**Model for 0.x: maintainer-led.** The lead maintainer (see [MAINTAINERS.md](MAINTAINERS.md)) makes final decisions. Additional maintainers are added by the lead maintainer after sustained, high-quality contributions.

## Decisions

- Day-to-day changes: reviewed and merged by any maintainer.
- Changes to the public API, evaluation methodology (splits, metrics, thresholds), license, or this document: an architecture decision record in `docs/adr/`, open for comment for at least 7 days.
- Evidence first: claims about retrieval quality must come with reproducible measurements.

## Open source and the commercial offering

RadarDB is developed by a company that also intends to offer a managed cloud and enterprise edition. Commitments:

1. The community edition stays genuinely useful on its own: local ingestion, retrieval, evaluation, optimization, CLI and API, with no account, telemetry or paid key required.
2. Published algorithms are not degraded to drive upgrades.
3. Commercial features (hosting, multi-tenancy, teams, SSO, managed connectors, scheduled optimization, audit and governance) are built on the public engine through versioned interfaces, not by forking it.
4. The boundary is documented publicly in [docs/COMMUNITY_VS_COMMERCIAL.md](docs/COMMUNITY_VS_COMMERCIAL.md).

This document will be revisited when the project has external maintainers.
