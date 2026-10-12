/**
 * Entry: V1.1B EnterpriseRAG evaluator. smoke-2k runs in the V1 2K work dir (its caches);
 * smoke-10k and heldout run in the 10K work dir built by the resource feasibility check.
 *   NODE_OPTIONS=--max-old-space-size=8192 node node_modules/tsx/dist/cli.mjs --tsconfig research/v1.1/tsconfig.json research/v1.1/v11b/erb-heldout.ts <smoke-2k|smoke-10k|heldout>
 */
import path from "node:path";

const root = process.cwd();
process.env.RADAR_ROOT = root;
const mode = process.argv[2];
process.chdir(path.join(root, mode === "smoke-2k" ? "validation/work/enterpriserag/scale-2000" : "research/v1.1/v11b/work/erb-10k"));
await import("./erb-heldout-body");
