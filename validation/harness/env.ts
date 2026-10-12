import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertFrozen, FROZEN_COMMIT, FROZEN_TAG } from "./freeze";
import { enumerateSpace } from "@/engine/optimizer/space";
import { demoRouter } from "@/engine/router";
import { importOptional } from "./optional";

export const SEED = 20261001;

function sha256File(f: string) {
  return createHash("sha256").update(fs.readFileSync(f)).digest("hex");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

async function hubSha(repo: string): Promise<string | null> {
  try {
    const r = await fetch(`https://huggingface.co/api/models/${repo}`);
    return ((await r.json()) as { sha?: string }).sha ?? null;
  } catch {
    return null;
  }
}

/** Writes validation/environment.json (models, hardware, data hashes, freeze status). */
export async function writeEnvironment(file = "validation/environment.json") {
  const frozen = assertFrozen();
  const modelDir = path.join("node_modules", "@huggingface", "transformers", ".cache");
  const modelFiles = walk(modelDir)
    .filter((f) => /\.(onnx|json)$/.test(f))
    .map((f) => ({ file: path.relative(modelDir, f).split(path.sep).join("/"), sha256: sha256File(f) }));
  const dataFiles = walk(path.join("validation", "data"))
    .filter((f) => /\.(parquet|jsonl|tsv|zip)$/.test(f) && !/[\\/]passages[\\/]/.test(f))
    .map((f) => ({ file: path.relative("validation/data", f).split(path.sep).join("/"), bytes: fs.statSync(f).size, sha256: sha256File(f) }));
  const env = {
    date: new Date().toISOString(),
    radardb: { commit: FROZEN_COMMIT, tag: FROZEN_TAG, srcSha256: frozen.srcSha256, harnessHead: frozen.commit },
    node: process.version,
    nodeFlags: process.execArgv,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: { model: os.cpus()[0]?.model, logicalCores: os.cpus().length },
    ramGB: Number((os.totalmem() / 2 ** 30).toFixed(1)),
    gpu: "none used (Intel Iris Xe present; all inference on CPU via onnxruntime-node)",
    git: execFileSync("git", ["--version"], { encoding: "utf8" }).trim(),
    models: {
      embedding: { id: "Xenova/all-MiniLM-L6-v2", dtype: "q8", hubSha: await hubSha("Xenova/all-MiniLM-L6-v2") },
      reranker: { id: "Xenova/ms-marco-MiniLM-L-6-v2", dtype: "q8", hubSha: await hubSha("Xenova/ms-marco-MiniLM-L-6-v2") },
      externalBaselineF: { id: "Xenova/bge-base-en-v1.5", fallback: "Xenova/bge-small-en-v1.5", hubSha: await hubSha("Xenova/bge-base-en-v1.5") },
      localFiles: modelFiles,
    },
    transformersJs: JSON.parse(fs.readFileSync("node_modules/@huggingface/transformers/package.json", "utf8")).version,
    optimizer: { configurations: enumerateSpace().length, router: demoRouter.version, fallbackThreshold: demoRouter.fallbackThreshold, minClassQuestions: 3 },
    seed: SEED,
    datasets: {
      enterpriserag: { source: "huggingface.co/datasets/onyx-dot-app/EnterpriseRAG-Bench", revision: "69916e31c68aa5963c00248fd7f0bc12d04fd235" },
      ...((await importOptional<{ PRIVATE_DATASETS: Record<string, unknown> }>(import.meta.dirname, "env-private.ts"))?.PRIVATE_DATASETS ?? {}),
      wixqa: { source: "huggingface.co/datasets/Wix/WixQA", revision: "d662dc42479c14e202eccd832f8c4b66a035c4cc" },
      files: dataFiles,
    },
  };
  fs.writeFileSync(file, JSON.stringify(env, null, 2));
  return env;
}
