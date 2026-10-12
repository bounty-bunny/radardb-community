import path from "node:path";
import { runFeasibility } from "./feasibility-core";
import { readJson } from "./datasets/enterpriserag";
import { loadArticles, loadPrimaryQuestions, toDocuments, toHarnessQuestions, wixToOriginal } from "./datasets/wixqa";

const ROOT = process.env.RADAR_ROOT!;
const scale = process.argv[2];

await runFeasibility({
  name: `wixqa-feasibility-${scale}`,
  label: `V1 ENGINE feasibility + optimization search — WixQA primary (ExpertWritten + Simulated), ${scale} articles; optimization questions only; no held-out labels; no comparisons`,
  root: ROOT,
  work: process.cwd(),
  resultFile: path.join(ROOT, `validation/results/wixqa-feasibility-${scale}.json`),
  load: async () => {
    const manifest = readJson<{ rows: number[]; sha256: string; goldDensity: number; gold: number }>(path.join(ROOT, `validation/work/wixqa/manifest-${scale}.json`));
    const split = readJson<{ questions: { questionId: string; split: "optimization" | "validation" }[] }>(path.join(ROOT, "validation/splits/wixqa.json")).questions;
    // Optimization questions only; held-out questions are dropped before anything else uses them.
    const questions = toHarnessQuestions(await loadPrimaryQuestions(), split).filter((q) => q.split === "optimization");
    const rows = new Set(manifest.rows);
    const documents = toDocuments((await loadArticles()).filter((_, i) => rows.has(i)));
    return { documents, toOriginal: wixToOriginal, questions, corpusFacts: { dataset: "wixqa", scale, manifestSha256: manifest.sha256, goldArticles: manifest.gold, goldDensity: manifest.goldDensity } };
  },
});
