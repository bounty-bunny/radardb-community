/**
 * Entry: WixQA V1 engine feasibility + optimization search (optimization questions only).
 *   NODE_OPTIONS=--max-old-space-size=8192 node node_modules/tsx/dist/cli.mjs --tsconfig validation/tsconfig.json validation/harness/wixqa-feasibility.ts <2000|full>
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scale = process.argv[2];
if (scale !== "2000" && scale !== "full") throw new Error("usage: wixqa-feasibility.ts <2000|full>");
const work = path.join(root, "validation", "work", "wixqa", `v1-${scale}`);
fs.mkdirSync(work, { recursive: true });
process.env.RADAR_ROOT = root;
process.chdir(work);
await import("./wixqa-feasibility-body");
