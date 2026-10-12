/**
 * Generates realistic *distractor* data for the demo workspace: older deploy
 * logs, incidents, Jira backlogs, Slack chatter, commits and runbooks that
 * share vocabulary with the real answers without containing them.
 *
 * Deterministic (seeded) and validated: generation fails if any generated
 * text contains a required fact from evals.json.
 *
 *   npx tsx scripts/generate-corpus.ts
 */
import fs from "node:fs";
import path from "node:path";
import { normalize } from "@/engine/text";

const OUT = path.join(process.cwd(), "data", "demo", "generated");

let seed = 20260930;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pad = (n: number) => String(n).padStart(2, "0");
const hex7 = () => {
  let s = "";
  while (!/\d/.test(s) || !/[a-f]/.test(s)) s = Array.from({ length: 7 }, () => "0123456789abcdef"[int(0, 15)]).join("");
  return s;
};

const PEOPLE = [
  "Priya Nair", "Daniel Kim", "Lena Chen", "Marcus Webb", "Tom Okafor", "Jonas Weber", "Mei Tanaka", "Sofia Alvarez",
  "Raj Patel", "Aisha Bello", "Omar Haddad", "Elena Rossi", "Kwame Mensah", "Hana Sato", "Lucas Moreau", "Nina Petrova",
] as const;
const SERVICES = [
  "checkout-svc", "cart-svc", "pricing-svc", "inventory-svc", "payments-api", "notification-worker", "edge-gateway",
  "search-svc", "shipping-svc", "tax-svc", "fraud-svc", "catalog-svc", "auth-svc", "customer-svc",
] as const;
const TEAMS = ["Team Falcon", "Team Atlas", "Team Ledger", "Team Hermes", "Team Platform", "Team Data", "Team Compass"];
const CHANGES = [
  "bump dependencies", "add tracing spans to {x} handler", "tune HTTP client timeouts", "refactor {x} module",
  "enable {f} for {p}%", "fix flaky retry in {x} client", "upgrade runtime to latest LTS", "add metrics for {x}",
  "remove dead code in {x}", "raise pod memory limit to 2Gi", "move config to secrets manager", "add idempotency keys to {x}",
  "cache {x} responses for 60s", "reduce log verbosity", "batch writes to {x}", "add circuit breaker around {x}",
];
const NOUNS = ["promotions", "address", "shipping quotes", "tax rates", "fraud scores", "search", "carts", "orders", "refunds", "sessions", "webhooks", "invoices"];
const FLAGS = ["checkout.express_pay", "checkout.gift_wrap", "checkout.saved_addresses", "payments.3ds_v2", "payments.wallets", "orders.split_shipments", "checkout.guest_upsell"];

function change() {
  return pick(CHANGES).replace("{x}", pick(NOUNS)).replace("{f}", pick(FLAGS)).replace("{p}", String(pick([5, 10, 25, 50])));
}

function write(name: string, title: string, source: string, updated: string, body: string) {
  fs.writeFileSync(path.join(OUT, `${name}.md`), `---\ntitle: "${title}"\nsource: ${source}\nupdated: ${updated}\n---\n${body.trim()}\n`);
}

function deployLog(month: number, startId: number, rows: number) {
  const mm = pad(month);
  const lines = [
    `# Production deploy log — 2026-${mm}`,
    "",
    "| Deploy | Date (UTC) | Service | Version | Author | Approver | Status | Change |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (let i = 0; i < rows; i++) {
    const author = pick(PEOPLE);
    let approver = pick(PEOPLE);
    while (approver === author) approver = pick(PEOPLE);
    const status = rand() < 0.08 ? "failed canary" : "success";
    lines.push(
      `| DEP-${startId + i} | 2026-${mm}-${pad(int(1, 28))} ${pad(int(8, 18))}:${pad(int(0, 59))} | ${pick(SERVICES)} | v${int(1, 7)}.${int(0, 30)}.${int(0, 9)} | ${author} | ${approver} | ${status} | ${change()} |`,
    );
  }
  write(`deploy-log-2026-${mm}`, `Production deploy log — 2026-${mm}`, "deployctl", `2026-${mm}-28`, lines.join("\n"));
}

const INCIDENTS: { title: string; services: string; summary: string; cause: string; fix: string }[] = [
  {
    title: "Checkout latency during autumn sale warm-up",
    services: "checkout-svc, edge-gateway",
    summary: "Checkout p99 latency reached 1.4 s for 22 minutes while traffic ramped up before the sale.",
    cause: "edge-gateway autoscaling used a CPU target of 80%, so new pods arrived after queues had already built up.",
    fix: "Lowered the autoscaling CPU target to 60% and added scheduled pre-scaling before announced sales.",
  },
  {
    title: "Expired TLS certificate on shipping-svc",
    services: "shipping-svc",
    summary: "Shipping quotes failed for 41 minutes, so checkout fell back to flat-rate shipping.",
    cause: "cert-manager could not renew the certificate because the ACME account secret had been rotated by hand.",
    fix: "Restored the secret and added an alert on certificates expiring within 14 days.",
  },
  {
    title: "Kafka rebalance storm on orders topic",
    services: "notification-worker, fraud-svc",
    summary: "Consumers on the orders topic rebalanced continuously for 35 minutes and processing stalled.",
    cause: "A rolling restart with max.poll.interval.ms below the slowest batch made consumers leave the group repeatedly.",
    fix: "Raised max.poll.interval.ms to 10 minutes and switched to cooperative sticky assignment.",
  },
  {
    title: "redis-sessions memory eviction",
    services: "edge-gateway, redis-sessions",
    summary: "Shoppers were logged out mid-checkout; roughly 3% of sessions were lost.",
    cause: "maxmemory-policy was allkeys-lru and a marketing batch job wrote large keys into the session cluster.",
    fix: "Moved the batch job to its own Redis and set maxmemory-policy to volatile-lru.",
  },
  {
    title: "Pricing cache stampede after deploy",
    services: "pricing-svc, checkout-svc",
    summary: "pricing-svc CPU hit 100% for 9 minutes after a deploy flushed the promotion cache.",
    cause: "All pods rebuilt the promotion rule cache at the same moment because cache keys had no jittered expiry.",
    fix: "Added request coalescing and jittered TTLs to the promotion cache.",
  },
  {
    title: "Fraud vendor rate limiting",
    services: "fraud-svc, payments-api",
    summary: "12% of payments were sent to manual review for an hour.",
    cause: "fraud-svc exceeded the vendor's 300 requests per second limit after retries were added without backoff.",
    fix: "Added token-bucket client side rate limiting and exponential backoff.",
  },
  {
    title: "Tax rounding errors in EU orders",
    services: "tax-svc",
    summary: "About 1,100 EU orders were charged one cent more VAT than displayed.",
    cause: "tax-svc rounded per line item while the cart displayed totals rounded per order.",
    fix: "Unified rounding to per-order banker's rounding and refunded affected customers.",
  },
  {
    title: "DNS resolution failures in eu-west",
    services: "edge-gateway, payments-api",
    summary: "Intermittent 503 responses for 18 minutes in eu-west.",
    cause: "CoreDNS pods were throttled by a too-low CPU limit after a node pool migration.",
    fix: "Raised CoreDNS limits and enabled NodeLocal DNSCache.",
  },
  {
    title: "Disk full on orders-db replica",
    services: "orders-db",
    summary: "A read replica stopped replaying WAL and reporting queries returned stale data for 2 hours.",
    cause: "The log volume filled because log_min_duration_statement was set to 0 during a debugging session and never reverted.",
    fix: "Reverted the setting and added disk usage alerts at 80%.",
  },
  {
    title: "Memory leak in edge-gateway",
    services: "edge-gateway",
    summary: "edge-gateway pods were OOM-killed every 3 hours, causing short bursts of 502s.",
    cause: "HTTP/3 connection state was not released when mobile clients migrated networks.",
    fix: "Upgraded the QUIC library and capped idle connection lifetime at 5 minutes.",
  },
  {
    title: "Clock skew rejecting auth tokens",
    services: "auth-svc",
    summary: "Token validation failed for about 4% of requests on two nodes.",
    cause: "chrony was disabled on a new node image, so clocks drifted by 90 seconds.",
    fix: "Re-enabled chrony in the base image and added a clock offset alert.",
  },
  {
    title: "Search index rebuild overloaded catalog-svc",
    services: "search-svc, catalog-svc",
    summary: "Product pages were slow for 50 minutes while search reindexed.",
    cause: "The nightly reindex ran in the daytime after a cron timezone change and read catalog-svc without throttling.",
    fix: "Pinned the cron timezone to UTC and throttled reindex reads.",
  },
  {
    title: "Adyen webhook signature failures",
    services: "payments-api",
    summary: "Refund confirmations were not recorded for 3 hours.",
    cause: "The HMAC key for Adyen webhooks was rotated in the Adyen console but not in our secrets manager.",
    fix: "Updated the key and documented webhook key rotation in the payments runbook.",
  },
  {
    title: "Cart notes migration locked carts table",
    services: "cart-svc",
    summary: "Add-to-cart failed for 6 minutes during a schema migration.",
    cause: "The migration added a column with a volatile default, which rewrote the table under an exclusive lock.",
    fix: "Re-ran the migration with a nullable column and a background backfill.",
  },
];

function incidents() {
  INCIDENTS.forEach((inc, i) => {
    const id = 1800 + i * 13;
    const month = 3 + Math.floor(i / 3);
    const date = `2026-${pad(month)}-${pad(int(1, 27))}`;
    let ic = pick(PEOPLE);
    while (ic === "Marcus Webb" || ic === "Lena Chen") ic = pick(PEOPLE);
    const owner = pick(PEOPLE);
    write(
      `INC-${id}`,
      `INC-${id} — ${inc.title}`,
      "pagerduty",
      date,
      `# INC-${id}: ${inc.title}

Severity: ${pick(["Sev2", "Sev2", "Sev3"])}
Date: ${date}
Duration: ${int(9, 180)} minutes
Incident commander: ${ic}
Services: ${inc.services}

## Summary
${inc.summary}

## Root cause
${inc.cause}

## Resolution
${inc.fix}

## Follow-ups
- ${pick(["CHK", "PAY", "PLAT", "INV"])}-${int(500, 799)}: prevent recurrence (owner: ${owner})
- ${pick(["CHK", "PAY", "PLAT", "INV"])}-${int(500, 799)}: add a regression test or alert (owner: ${pick(PEOPLE)})`,
    );
  });
}

const TICKET_SUMMARIES = [
  "Add {x} dashboard", "Migrate {x} to new client library", "Investigate slow {x} queries", "Document {x} runbook",
  "Remove {f} flag", "Load test {x} endpoint", "Reduce {x} p99 latency", "Add alert for {x} errors", "Clean up {x} retries",
  "Backfill {x} data", "Upgrade {x} SDK", "Improve {x} error messages", "Add contract tests for {x}",
];

function jira(project: string, from: number, count: number) {
  const out = [`# Jira backlog — ${project}`, ""];
  for (let i = 0; i < count; i++) {
    const summary = pick(TICKET_SUMMARIES).replace("{x}", pick(NOUNS)).replace("{f}", pick(FLAGS));
    const status = pick(["To Do", "To Do", "In Review", "Done", "Done", "Blocked"]);
    out.push(
      `## ${project}-${from + i}: ${summary}`,
      `Status: ${status} · Assignee: ${pick(PEOPLE)} · Priority: ${pick(["Low", "Medium", "Medium", "High"])}`,
      `${pick([
        "Agreed in sprint planning; see linked design doc.",
        "Raised by on-call after last week's page.",
        "Needed before the Q4 change freeze.",
        "Low effort, good starter task.",
        "Depends on the platform team finishing the client migration.",
      ])}`,
      "",
    );
  }
  write(`jira-${project.toLowerCase()}-backlog`, `Jira backlog — ${project}`, "jira", "2026-09-26", out.join("\n"));
}

const CHAT = [
  "anyone else seeing elevated p99 on {s}? looks like a noisy neighbour",
  "deploying {s} after lunch, ping me if the canary looks off",
  "reminder: use flagctl, not the LaunchDarkly UI, so changes are audited",
  "PgBouncer stats look normal on {s} today",
  "the pricing cache hit rate dipped to 82% overnight, investigating",
  "can someone review my PR for {s}? small change to retries",
  "who owns the {s} dashboards now that the team split?",
  "rollback drill is scheduled for Thursday on staging",
  "staging is broken again, {s} cannot reach the database",
  "we should add a query-count check to {s} too",
  "heads up: Stripe sandbox is flaky this morning",
  "postmortem review moved to Friday",
  "is the Adyen sandbox key in vault yet?",
  "latency graphs for {s} are missing since the Grafana upgrade",
];

function slack(day: number) {
  const lines = [`# #checkout-dev — 2026-09-${pad(day)}`, ""];
  let h = 9;
  let m = 0;
  for (let i = 0; i < int(10, 16); i++) {
    m += int(3, 40);
    if (m >= 60) (h += 1), (m -= 60);
    lines.push(`${pad(h)}:${pad(m)} ${pick(PEOPLE)}: ${pick(CHAT).replace("{s}", pick(SERVICES))}`);
  }
  write(`slack-checkout-dev-09-${pad(day)}`, `#checkout-dev — 2026-09-${pad(day)}`, "slack", `2026-09-${pad(day)}`, lines.join("\n"));
}

function commits(repo: string) {
  const lines = [`# Recent commits on main (acme/${repo})`, ""];
  for (let i = 0; i < 18; i++)
    lines.push(`- ${hex7()} 2026-0${int(7, 9)}-${pad(int(1, 28))} ${pick(PEOPLE)}: ${change()}`);
  write(`commits-${repo}`, `acme/${repo} — recent commits on main`, "github", "2026-09-28", lines.join("\n"));
}

const RUNBOOKS: { name: string; title: string; body: string }[] = [
  {
    name: "runbook-redis-sessions",
    title: "Runbook — redis-sessions failover",
    body: `# Runbook: redis-sessions failover

## Symptoms
Shoppers are logged out, or edge-gateway logs show READONLY errors from redis-sessions.

## Steps
1. Check sentinel status with \`redis-cli -p 26379 sentinel masters\`.
2. If the primary is down for more than 20 seconds, sentinel promotes a replica automatically.
3. Restart edge-gateway pods only if they keep connecting to the old primary.

## Notes
Sessions are not replicated across regions. A regional failover logs every shopper out.`,
  },
  {
    name: "runbook-kafka-consumer-reset",
    title: "Runbook — resetting a Kafka consumer group",
    body: `# Runbook: resetting a Kafka consumer group

## When to use
Only when a consumer group is stuck and skipping messages is acceptable, for example analytics consumers.

## Steps
1. Scale the consumer deployment to zero.
2. Run \`kafka-consumer-groups --group <group> --reset-offsets --to-latest --execute\`.
3. Scale the deployment back up and watch lag.

## Never
Never reset notification-worker offsets without Team Hermes: skipped messages mean customers never get emails.`,
  },
  {
    name: "runbook-pricing-cache",
    title: "Runbook — flushing the pricing promotion cache",
    body: `# Runbook: flushing the pricing promotion cache

## When to use
Promotion changes made in the admin tool do not show up at checkout after 5 minutes.

## Steps
1. Flush one pod at a time with \`pricingctl cache flush --pod <pod>\`.
2. Do not flush all pods at once; that caused a cache stampede in the past.
3. Confirm the new promotion with a test cart in staging first.`,
  },
  {
    name: "runbook-certificates",
    title: "Runbook — TLS certificate rotation",
    body: `# Runbook: TLS certificate rotation

## Steps
1. Check expiry with \`kubectl get certificates -A\`.
2. Force renewal with \`cmctl renew <certificate> -n <namespace>\`.
3. If renewal fails, check the ACME account secret and the ClusterIssuer events.

## Escalation
Page Team Platform if a Tier 0 certificate expires within 72 hours and cannot be renewed.`,
  },
  {
    name: "runbook-search-reindex",
    title: "Runbook — search reindex",
    body: `# Runbook: search reindex

## Steps
1. Trigger the reindex job with \`searchctl reindex --throttle 200\`.
2. Reindex outside business hours; it reads every product from catalog-svc.
3. Swap the alias only after document counts match.

## Rolling back
Point the products alias back to the previous index with \`searchctl alias set products <old-index>\`.`,
  },
  {
    name: "guide-local-development",
    title: "Guide — local development for checkout",
    body: `# Local development for checkout

## Setup
Run \`make dev\` to start checkout-svc, cart-svc and a local Postgres with seeded carts. Stripe and Adyen are replaced by a fake payment provider.

## Tests
Run \`make test\` for unit tests and \`make itest\` for integration tests against Docker.

## Feature flags locally
Flags default to their production values. Override with \`FLAG_OVERRIDES=checkout.one_click=false make dev\`.`,
  },
];

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  deployLog(7, 1080, 46);
  deployLog(8, 1126, 46);
  incidents();
  jira("CHK", 700, 22);
  jira("PAY", 260, 18);
  jira("PLAT", 400, 22);
  jira("INV", 90, 14);
  for (const d of [2, 8, 11, 17, 23, 29]) slack(d);
  for (const r of ["payments-api", "inventory-svc", "pricing-svc", "edge-gateway"]) commits(r);
  for (const r of RUNBOOKS) write(r.name, r.title, "confluence", "2026-06-30", r.body);

  // Validate: generated text must never contain an answer.
  type Fact = string | string[];
  const evals = JSON.parse(fs.readFileSync(path.join(OUT, "..", "evals.json"), "utf8")) as { id: string; facts: Fact[] }[];
  const alts = evals.flatMap((q) => q.facts.flatMap((f) => (Array.isArray(f) ? f : [f]).map((a) => ({ id: q.id, a: normalize(a) }))));
  const problems: string[] = [];
  for (const f of fs.readdirSync(OUT)) {
    const text = normalize(fs.readFileSync(path.join(OUT, f), "utf8"));
    for (const { id, a } of alts) if (text.includes(a)) problems.push(`${f} contains fact of ${id}: "${a}"`);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`generated ${fs.readdirSync(OUT).length} files, no fact collisions`);
}

main();
