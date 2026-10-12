/** Entry: EnterpriseRAG 10K resource-only feasibility of the candidate FusionContextPlan (fresh work dir). */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
process.env.RADAR_ROOT = root;
const work = path.join(root, "research", "v1.1", "v11b", "work", "erb-10k");
fs.mkdirSync(work, { recursive: true });
process.chdir(work);
await import("./erb10k-feasibility-body");
