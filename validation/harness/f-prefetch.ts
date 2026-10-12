// Stage B prefetch: download and load both Baseline F models once (not timed as indexing).
import { F_MODELS, embedF, type FModel } from "./baseline-f";

for (const m of Object.keys(F_MODELS) as FModel[]) {
  const t = Date.now();
  const [v] = await embedF(m, ["prefetch probe"]);
  console.log(`${m} (${F_MODELS[m]}) ready: dim ${v.length}, ${((Date.now() - t) / 1000).toFixed(1)}s`);
}
