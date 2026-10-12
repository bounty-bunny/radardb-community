/**
 * Entry: WixQA Synthetic evaluator; runs in the WixQA V1 full-scale work dir (its representation caches).
 *   NODE_OPTIONS=--max-old-space-size=8192 node node_modules/tsx/dist/cli.mjs --tsconfig research/v1.1/tsconfig.json research/v1.1/v11c/synthetic-eval.ts <smoke|timing|test>
 * Caches are never flushed, so the frozen work directory is not modified.
 */
import path from "node:path";

const root = process.cwd();
process.env.RADAR_ROOT = root;
process.chdir(path.join(root, "validation/work/wixqa/v1-full"));
await import("./synthetic-eval-body");
