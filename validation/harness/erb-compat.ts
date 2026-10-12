/**
 * Entry: EnterpriseRAG compatibility run at a given scale (default 2000).
 * Sets an isolated working directory BEFORE the frozen engine loads, because
 * V1's embedding/rerank caches live at <cwd>/.radar/cache.
 *
 *   node --max-old-space-size=8192 node_modules/tsx/dist/cli.mjs --tsconfig validation/tsconfig.json validation/harness/erb-compat.ts [scale]
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scale = Number(process.argv[2] ?? 2000);
const work = path.join(root, "validation", "work", "enterpriserag", `scale-${scale}`);
fs.mkdirSync(work, { recursive: true });
process.env.RADAR_ROOT = root;
process.chdir(work);
await import("./erb-compat-body");
