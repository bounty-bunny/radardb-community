import { createHash } from "node:crypto";

const STOPWORDS = new Set(
  ("a an and are as at be been but by can could did do does for from had has have how i if in into is it its " +
    "me my not of on or our should so that the their them then there these they this to us was we were what when " +
    "where which who whom why will with would you your about after before during over under up down out any all " +
    "each than too very just also")
    .split(" "),
);

/** Lowercase, drop punctuation, collapse whitespace. Used for evidence matching. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !/\d/.test(w)) return w.slice(0, -1);
  return w;
}

/**
 * Lexical tokens for BM25. Compound identifiers (checkout-svc, INC-2041,
 * payments.provider.fallback) are kept whole *and* split into parts so both
 * exact and partial matches score.
 */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  const raw = s.toLowerCase().match(/[a-z0-9][a-z0-9._\-/]*[a-z0-9]|[a-z0-9]/g) ?? [];
  for (const t of raw) {
    if (/[._\-/]/.test(t)) {
      out.push(t);
      for (const p of t.split(/[._\-/]+/)) if (p && !STOPWORDS.has(p)) out.push(stem(p));
    } else if (!STOPWORDS.has(t)) {
      out.push(stem(t));
    }
  }
  return out;
}

/** ~4 characters per token, the usual rule of thumb for English with code. */
export function estTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

/** Deterministic hash of a string to [0, 1). */
export function hashUnit(s: string): number {
  return parseInt(sha1(s).slice(0, 8), 16) / 0x100000000;
}
