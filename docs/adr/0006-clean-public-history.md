# ADR 0006: Start the public repository from a clean history

- **Status:** Accepted (2026-10-11)
- **Date:** 2026-10-11

## Context

The private history (all branches) contains:
- personal author email addresses;
- sealed-test evidence with dataset-derived identifiers (MTRAG terms restrict redistribution);
- the V1.1 research harness;
- the commercial pilot plan;
- a separate Jev research branch.

No secrets were found (see OPEN_SOURCE_AUDIT).

## Decision

Publish a **new repository with a single initial commit** generated from the classified file set by the maintainers' release tooling, which stays with the private repository. The private repository remains the system of record for history, tags and sealed evidence.

- **Identity:** the public commit is authored and signed off (DCO) by the lead maintainer with a GitHub no-reply address. No personal email address appears in the public history.
- **Verification:** the release tooling checks the candidate has exactly one commit, no remotes, no personal emails, no secrets, no unstaged-class files, and keeps `"private": true` until a license is approved.
- **Later releases:** future public commits are made directly in the public repository. Private-to-public sync goes through reviewed exports, never by pushing private branches.

## Alternatives considered

- **Rewrite private history** (`git filter-repo`) to drop files and remap emails: high effort, error-prone, and it rewrites tags that anchor the sealed evidence. Rejected.
- **Publish the existing history:** exposes personal emails and private material. Rejected.
