# Security policy

## Supported versions

RadarDB is pre-1.0. Security fixes are made on the latest 0.x release only.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub's private vulnerability reporting: [Report a vulnerability](https://github.com/bounty-bunny/radardb-community/security/advisories/new), or by email to **[[OWNER: security contact address, e.g. a monitored project alias, to be provided before release]]**.

Include affected version or commit, reproduction steps, and impact. We aim to acknowledge reports within 3 business days and to agree a disclosure timeline with you.

## Deployment model and known limits

RadarDB is a **local, single-user tool**. By default the console and control plane bind to `127.0.0.1` and refuse non-local hosts; the data plane requires `RADAR_API_KEY` when set. There is no authentication for multiple users, no per-user document permissions, and no encryption at rest beyond your disk encryption. **Do not expose RadarDB to a network you do not control.**

The enforced controls and known gaps are documented in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md). Retrieved context is untrusted document content: never let it act as instructions in your prompts.
