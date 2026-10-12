/**
 * Entry: EnterpriseRAG engine FEASIBILITY at a given scale (default 10000).
 * Optimization questions only. No held-out labels, no comparisons.
 * Run with NODE_OPTIONS=--max-old-space-size=8192 so the preregistered heap
 * flag reaches tsx's child process.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scale = Number(process.argv[2] ?? 10000);
const work = path.join(root, "validation", "work", "enterpriserag", `scale-${scale}`);
fs.mkdirSync(work, { recursive: true });
process.env.RADAR_ROOT = root;
process.chdir(work);
await import("./erb-feasibility-body");
