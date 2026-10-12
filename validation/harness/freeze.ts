import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const FROZEN_COMMIT = "a2464f5800cb200b219bef55b5534271e2584ff8";
export const FROZEN_TAG = "v1.0.0-alpha";
const FROZEN_PATHS = ["src/", "data/demo/", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json"];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** sha256 over sorted relative paths + contents of src/. */
export function srcHash(root = process.cwd()): string {
  const h = createHash("sha256");
  for (const f of walk(path.join(root, "src")).sort()) {
    h.update(path.relative(root, f).split(path.sep).join("/"));
    h.update(fs.readFileSync(f));
  }
  return h.digest("hex");
}

/**
 * Files that changed after the V1 freeze in purely additive ways (verified by review; no retrieval behavior change):
 *   assembler.ts — `units` exported; domain.ts — optional `fusion` provenance field; two console pages; package.json scripts/engines.
 */
export const ALLOWED_ADDITIVE_CHANGES = ["package.json", "src/app/developers/page.tsx", "src/app/plans/page.tsx", "src/core/domain.ts", "src/engine/assembler.ts"];

const normalized = (b: Buffer) => (b.includes(0) ? b : Buffer.from(b.toString("utf8").replace(/\r\n/g, "\n"), "utf8"));

/**
 * REPRODUCTION MODE (RADAR_REPRODUCE=1): without the original git history, verify the frozen engine file by file
 * against validation/harness/frozen-manifest.json. Every frozen file must be byte-identical (LF-normalized) except
 * the documented additive changes above; new files are allowed (frozen files cannot import them unchanged).
 */
export function assertFrozenByManifest(root = process.cwd()) {
  const m = JSON.parse(fs.readFileSync(path.join(root, "validation/harness/frozen-manifest.json"), "utf8")) as {
    frozenRelease: string;
    metadataOnly: Record<string, { ignores: string[]; sha256: string }>;
    files: Record<string, string>;
  };
  const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
  // Release metadata only: package-lock.json may differ in the root package's own version/license (a release bump),
  // tsconfig.json in its "exclude" list (typecheck scope). Everything else in those files, i.e. dependencies and
  // compiler options, must still match the freeze.
  const withoutMetadata: Record<string, (j: Record<string, any>) => void> = {
    "package-lock.json": (j) => {
      delete j.version;
      if (j.packages?.[""]) {
        delete j.packages[""].version;
        delete j.packages[""].license;
      }
    },
    "tsconfig.json": (j) => {
      delete j.exclude;
    },
  };
  const metadataMatches = (f: string, text: string) => {
    const rule = m.metadataOnly[f];
    if (!rule || !withoutMetadata[f]) return false;
    const j = JSON.parse(text);
    withoutMetadata[f](j);
    return sha(JSON.stringify(j)) === rule.sha256;
  };
  const changed: string[] = [];
  const metadataOnly: string[] = [];
  const missing: string[] = [];
  for (const [f, want] of Object.entries(m.files)) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) missing.push(f);
    else if (sha(normalized(fs.readFileSync(p))) !== want) {
      if (metadataMatches(f, fs.readFileSync(p, "utf8"))) metadataOnly.push(f);
      else changed.push(f);
    }
  }
  const unexpected = changed.filter((f) => !ALLOWED_ADDITIVE_CHANGES.includes(f));
  if (missing.length || unexpected.length) throw new Error(`FREEZE VIOLATION (reproduction mode): missing ${JSON.stringify(missing)}, changed ${JSON.stringify(unexpected)}`);
  const n = Object.keys(m.files).length;
  return {
    commit: `reproduction of ${m.frozenRelease}`,
    srcSha256: srcHash(root),
    reproduction: { frozenFiles: n, identical: n - changed.length - metadataOnly.length, allowedAdditiveChanges: changed, metadataOnlyChanges: metadataOnly },
  };
}

/** Abort unless the frozen engine is byte-identical to the frozen commit (tracked and untracked files). */
export function assertFrozen(root = process.cwd()): { commit: string; srcSha256: string } {
  if (process.env.RADAR_REPRODUCE === "1") return assertFrozenByManifest(root);
  try {
    execFileSync("git", ["diff", "--quiet", FROZEN_COMMIT, "--", ...FROZEN_PATHS], { cwd: root, stdio: "pipe" });
  } catch {
    throw new Error(`FREEZE VIOLATION: frozen paths differ from ${FROZEN_COMMIT}`);
  }
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", "src/"], { cwd: root, encoding: "utf8" }).trim();
  if (untracked) throw new Error(`FREEZE VIOLATION: untracked files in src/: ${untracked}`);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  return { commit: head, srcSha256: srcHash(root) };
}
