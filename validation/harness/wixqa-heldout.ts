/**
 * Entry: WixQA held-out evaluation (after the selection lock).
 *   NODE_OPTIONS=--max-old-space-size=8192 node node_modules/tsx/dist/cli.mjs --tsconfig validation/tsconfig.json validation/harness/wixqa-heldout.ts [--smoke]
 * --smoke runs the identical code path on 5 OPTIMIZATION questions (no held-out access).
 */
import path from "node:path";

const root = process.cwd();
process.env.RADAR_ROOT = root;
process.chdir(path.join(root, "validation", "work", "wixqa", "v1-full")); // reuse the frozen V1 caches of the full-scale run
await import("./wixqa-heldout-body");
