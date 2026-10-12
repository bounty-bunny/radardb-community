/**
 * Entity extraction for the lightweight knowledge graph. Entities are the
 * identifiers engineers actually use to join information across systems:
 * tickets, deploys, PRs, commits, versions, services and feature flags.
 */

export type EntityType = "ticket" | "pr" | "commit" | "version" | "service" | "flag";

const RULES: { type: EntityType; re: RegExp; norm: (m: RegExpExecArray) => string }[] = [
  { type: "ticket", re: /\b([A-Za-z]{2,5})-(\d{2,5})\b/g, norm: (m) => `${m[1].toUpperCase()}-${m[2]}` },
  { type: "pr", re: /(?:PR\s*)?#(\d{3,5})\b/gi, norm: (m) => `PR#${m[1]}` },
  { type: "commit", re: /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7}\b/g, norm: (m) => m[0] },
  { type: "version", re: /\bv(\d+\.\d+\.\d+)\b/g, norm: (m) => `v${m[1]}` },
  {
    type: "service",
    re: /\b[a-z]+(?:-[a-z]+)*-(?:svc|api|worker|db|gateway|sessions|schema)\b/g,
    norm: (m) => m[0],
  },
  { type: "flag", re: /\b(?:checkout|payments|orders?)\.[a-z_]+(?:\.[a-z_]+)?\b/g, norm: (m) => m[0] },
];

// Ticket-shaped strings that are not tickets.
const TICKET_DENY = new Set(["UTF-8", "HTTP-3"]);

export function extractEntities(text: string): string[] {
  const found = new Set<string>();
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      const e = rule.norm(m);
      if (rule.type === "ticket" && TICKET_DENY.has(e)) continue;
      found.add(e);
    }
  }
  return [...found];
}

/** Identifiers specific enough to hop between documents on. */
export function isLinkingEntity(e: string): boolean {
  return /^[A-Z]{2,5}-\d+$/.test(e) || e.startsWith("PR#") || /^[0-9a-f]{7}$/.test(e) || /^v\d/.test(e);
}
