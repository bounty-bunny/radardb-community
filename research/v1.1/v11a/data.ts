/**
 * V1.1A development datasets: OPTIMIZATION QUESTIONS ONLY.
 * Held-out sets (burned or untouched) are never loaded: every loader filters to
 * split === "optimization" immediately after reading the split file. Datasets whose
 * terms forbid redistribution live in optional private modules (see importOptional).
 */
import fs from "node:fs";
import path from "node:path";
import type { Document } from "@/core/domain";
import { normalize } from "@/engine/text";
import type { QOutcome } from "../../../validation/harness/select";
import { importOptional } from "../../../validation/harness/optional";

export type GroupFn = (items: { id: string; question: string; gold: string[]; conversation?: string }[]) => Map<string, string>;
type PrivateModule = { PRIVATE_DATASETS: readonly string[]; loadPrivateDataset: (id: string, groupsOf: GroupFn) => Promise<DevDataset> };
const privateData = await importOptional<PrivateModule>(import.meta.dirname, "data-private.ts");

/** Development datasets, in the order the locked development runs used. */
export const DATASETS: readonly string[] = ["wixqa", ...(privateData?.PRIVATE_DATASETS ?? []), "erb-2k"];
export type DatasetId = string;

export interface DevQuestion {
  id: string;
  question: string;
  gold: string[];
  group: string;
}

export interface DevDataset {
  id: DatasetId;
  /** Work directory holding the frozen V1 search outputs and model caches. */
  workDir: string;
  questions: DevQuestion[];
  loadDocuments: () => Promise<Document[]>;
}

const ROOT = () => process.env.RADAR_ROOT ?? process.cwd();
const readJson = <T>(f: string) => JSON.parse(fs.readFileSync(path.join(ROOT(), f), "utf8")) as T;

/** Union-find grouping: identical gold set, identical normalized text, same conversation. */
export function groupsOf(items: { id: string; question: string; gold: string[]; conversation?: string }[]): Map<string, string> {
  const parent = new Map(items.map((q) => [q.id, q.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const seen = new Map<string, string>();
  for (const q of items)
    for (const key of [`g:${[...q.gold].sort().join("|")}`, `q:${normalize(q.question)}`, ...(q.conversation ? [`c:${q.conversation}`] : [])]) {
      if (seen.has(key)) parent.set(find(q.id), find(seen.get(key)!));
      else seen.set(key, q.id);
    }
  return new Map(items.map((q) => [q.id, find(q.id)]));
}

export async function loadDataset(id: DatasetId): Promise<DevDataset> {
  if (id === "wixqa") {
    const { loadArticles, loadPrimaryQuestions, toDocuments } = await import("../../../validation/harness/datasets/wixqa");
    const split = readJson<{ questions: { questionId: string; split: string; group: string }[] }>("validation/splits/wixqa.json").questions.filter((q) => q.split === "optimization");
    const meta = new Map(split.map((q) => [q.questionId, q]));
    const questions = (await loadPrimaryQuestions()).filter((q) => meta.has(q.id)).map((q) => ({ id: q.id, question: q.question, gold: q.gold, group: meta.get(q.id)!.group }));
    return {
      id,
      workDir: "validation/work/wixqa/v1-full",
      questions,
      loadDocuments: async () => {
        const rows = new Set(readJson<{ rows: number[] }>("validation/work/wixqa/manifest-full.json").rows);
        return toDocuments((await loadArticles()).filter((_, i) => rows.has(i)));
      },
    };
  }
  if (privateData && privateData.PRIVATE_DATASETS.includes(id)) return privateData.loadPrivateDataset(id, groupsOf);
  if (id !== "erb-2k") throw new Error(`unknown or unavailable dataset: ${id}`);
  // EnterpriseRAG-Bench, 2K product-constrained scale (development only; its held-out split is never loaded).
  const { loadCorpus, loadQuestions } = await import("../../../validation/harness/datasets/enterpriserag");
  const opt = new Set(readJson<{ questions: { questionId: string; split: string }[] }>("validation/splits/enterpriserag.json").questions.filter((q) => q.split === "optimization").map((q) => q.questionId));
  const items = (await loadQuestions()).filter((q) => opt.has(q.question_id)).map((q) => ({ id: q.question_id, question: q.question, gold: [...new Set(q.expected_doc_ids ?? [])] }));
  const g = groupsOf(items);
  return {
    id,
    workDir: "validation/work/enterpriserag/scale-2000",
    questions: items.map((q) => ({ ...q, group: g.get(q.id)! })),
    loadDocuments: async () => (await loadCorpus(readJson("validation/work/enterpriserag/manifest-2000.json"))).documents,
  };
}

export function loadSearch(ds: DevDataset) {
  return readJson<{ trials: { key: string; config: import("@/core/domain").PlanConfig }[]; routedClass: Record<string, string>; outcomes: Record<string, Record<string, QOutcome>>; baselineKey: string }>(path.join(ds.workDir, "search.json"));
}
