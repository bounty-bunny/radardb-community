/** Entry: final fit of the candidate FusionContextPlan for one dataset (optimization questions only). */
import path from "node:path";

const root = process.cwd();
process.env.RADAR_ROOT = root;
const { loadDataset, DATASETS } = await import("../v11a/data");
const id = process.argv[2] as (typeof DATASETS)[number];
if (!DATASETS.includes(id)) throw new Error(`usage: final-fit.ts <${DATASETS.join("|")}>`);
process.chdir(path.join(root, (await loadDataset(id)).workDir));
await import("./final-fit-body");
