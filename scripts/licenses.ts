/**
 * Writes docs/THIRD_PARTY_LICENSES.md from package-lock.json (every installed package and its declared license).
 *   npx tsx scripts/licenses.ts           regenerate the inventory
 *   npx tsx scripts/licenses.ts --check   exit 1 if any package has a license outside the allowlist (CI gate)
 */
import fs from "node:fs";
import path from "node:path";

const lock = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8")) as { packages: Record<string, { version?: string; license?: string; dev?: boolean; optional?: boolean }> };
const rows = Object.entries(lock.packages)
  .filter(([p]) => p)
  .map(([p, v]) => ({ name: p.replace(/^.*node_modules\//, ""), version: v.version ?? "", license: v.license ?? "UNKNOWN", scope: v.dev ? "dev" : v.optional ? "optional" : "runtime" }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r.license] = (m[r.license] ?? 0) + 1), m), {});
let md = `# Third-party licenses\n\nGenerated from \`package-lock.json\` by \`npx tsx scripts/licenses.ts\`. Declared licenses only; verify before redistributing binaries or container images.\n\n`;
md += `| License | Packages |\n|---|---|\n${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `| ${l} | ${n} |`).join("\n")}\n\n`;
md += `| Package | Version | License | Scope |\n|---|---|---|---|\n${rows.map((r) => `| ${r.name} | ${r.version} | ${r.license} | ${r.scope} |`).join("\n")}\n`;
/** Permissive, or weak-copyleft components that are dev-only / optional native binaries (see NOTICE). */
const ALLOWED = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "(MIT OR CC0-1.0)", "CC0-1.0", "BlueOak-1.0.0", "CC-BY-4.0", "MPL-2.0", "LGPL-3.0-or-later", "Apache-2.0 AND LGPL-3.0-or-later", "Apache-2.0 AND LGPL-3.0-or-later AND MIT"]);
if (process.argv.includes("--check")) {
  const bad = rows.filter((r) => !ALLOWED.has(r.license));
  for (const r of bad) console.error(`license not allowed: ${r.name}@${r.version} (${r.license}, ${r.scope})`);
  console.log(`${rows.length} packages checked, ${bad.length} outside the allowlist`);
  process.exit(bad.length ? 1 : 0);
}
fs.writeFileSync(path.join(process.cwd(), "docs", "THIRD_PARTY_LICENSES.md"), md);
console.log(`wrote docs/THIRD_PARTY_LICENSES.md (${rows.length} packages)`);
