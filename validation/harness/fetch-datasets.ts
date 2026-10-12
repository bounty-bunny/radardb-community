/**
 * Download the public benchmark datasets used by the reproduction kit, at the exact revisions the locked
 * evaluations used, and verify their sha256. Nothing is redistributed by RadarDB: files come from their sources.
 *   node node_modules/tsx/dist/cli.mjs --tsconfig validation/tsconfig.json validation/harness/fetch-datasets.ts [enterpriserag|wixqa|all] [--verify-only]
 * EnterpriseRAG-Bench (MIT): documents ≈ 1.4 GB. WixQA (MIT): ≈ 60 MB.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

interface FileSpec {
  url: string;
  local: string;
  bytes: number;
  sha256: string;
}
const HF = (repo: string, rev: string, file: string) => `https://huggingface.co/datasets/${repo}/resolve/${rev}/${file}`;
const ERB_REV = "69916e31c68aa5963c00248fd7f0bc12d04fd235";
const WIX_REV = "d662dc42479c14e202eccd832f8c4b66a035c4cc";
export const DATASET_FILES: Record<"enterpriserag" | "wixqa", FileSpec[]> = {
  enterpriserag: [
    { url: HF("onyx-dot-app/EnterpriseRAG-Bench", ERB_REV, "data/documents/test.parquet"), local: "enterpriserag/documents.parquet", bytes: 1409893131, sha256: "6b0747bf160af9427b12101537d53056ac592ada9831c1a98ae01fa50a8d2a9f" },
    { url: HF("onyx-dot-app/EnterpriseRAG-Bench", ERB_REV, "data/questions/test.parquet"), local: "enterpriserag/questions.parquet", bytes: 408737, sha256: "e25066f4eff3843dd0f3df0d1348113471e072e75007ffe390a0aa83f2a80af2" },
  ],
  wixqa: [
    { url: HF("Wix/WixQA", WIX_REV, "wix_kb_corpus/wix_kb_corpus.jsonl"), local: "wixqa/wix_kb_corpus__wix_kb_corpus.jsonl", bytes: 53743863, sha256: "46b852c60b85fb1828e7c6118bb56ba796eba99120a6b69c6b984c06e1c5e1fe" },
    { url: HF("Wix/WixQA", WIX_REV, "wixqa_expertwritten/test.jsonl"), local: "wixqa/wixqa_expertwritten__test.jsonl", bytes: 255510, sha256: "a1bb6888a8394f980bc88f0d09b873fcd283ff4c9782600bc203f8103c2f1bad" },
    { url: HF("Wix/WixQA", WIX_REV, "wixqa_simulated/test.jsonl"), local: "wixqa/wixqa_simulated__test.jsonl", bytes: 88188, sha256: "9a2b9f42c081467b3de5bd92511e770bca3cc7977f169526fd78dd3c985ac4a8" },
    { url: HF("Wix/WixQA", WIX_REV, "wixqa_synthetic/test.jsonl"), local: "wixqa/wixqa_synthetic__test.jsonl", bytes: 6216364, sha256: "1d7e79f328db46537934081b3d9814b02dd0098d67a072cac5dadac636432054" },
  ],
};

const DATA = path.join(process.cwd(), "validation", "data");
async function sha256Of(file: string): Promise<string> {
  const h = createHash("sha256");
  await pipeline(fs.createReadStream(file), h);
  return h.digest("hex");
}

async function main() {
  const which = (process.argv[2] ?? "all") as "enterpriserag" | "wixqa" | "all";
  const verifyOnly = process.argv.includes("--verify-only");
  const sets = which === "all" ? (["wixqa", "enterpriserag"] as const) : [which];
  let failures = 0;
  for (const set of sets)
    for (const f of DATASET_FILES[set]) {
      const dst = path.join(DATA, f.local);
      if (!fs.existsSync(dst) || fs.statSync(dst).size !== f.bytes) {
        if (verifyOnly) {
          console.log(`MISSING  ${f.local}`);
          failures++;
          continue;
        }
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        console.log(`download ${f.url}`);
        const res = await fetch(f.url);
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${f.url}`);
        await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(`${dst}.part`));
        fs.renameSync(`${dst}.part`, dst);
      }
      const got = await sha256Of(dst);
      const ok = got === f.sha256;
      console.log(`${ok ? "ok      " : "MISMATCH"} ${f.local}`);
      if (!ok) failures++;
    }
  process.exit(failures ? 1 : 0);
}
main();
