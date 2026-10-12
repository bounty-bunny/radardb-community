/**
 * WixQA adapter (PREREGISTRATION §11). Each KB article becomes one RadarDB
 * Document (id = "wix:" + article id; content = plain-text `contents`), so
 * `article_ids` map 1:1. Primary questions: ExpertWritten + Simulated (400).
 * Question files carry no ids: id = "<subset>:<0-based line index>".
 */
import { createHash } from "node:crypto";
import type { Document } from "@/core/domain";
import type { HarnessQuestion } from "../scorers";
import { normalize } from "@/engine/text";
import { rng, shuffle } from "./enterpriserag";
import { jsonl } from "./jsonl";

export const WIX_DIR = `${process.env.RADAR_ROOT ?? process.cwd()}/validation/data/wixqa`;
export const PRIMARY_SUBSETS = ["expertwritten", "simulated"] as const;
export type Subset = "expertwritten" | "simulated" | "synthetic";

export interface WixArticle {
  id: string;
  title: string;
  contents: string;
  articleType: string;
  url: string;
}
export interface WixQuestion {
  id: string;
  subset: Subset;
  question: string;
  gold: string[];
}

export async function loadArticles(): Promise<WixArticle[]> {
  const out: WixArticle[] = [];
  for await (const a of jsonl<{ id: string; title?: string; contents?: string; article_type?: string; url?: string }>(`${WIX_DIR}/wix_kb_corpus__wix_kb_corpus.jsonl`))
    out.push({ id: String(a.id), title: a.title ?? "", contents: a.contents ?? "", articleType: a.article_type ?? "unknown", url: a.url ?? "" });
  return out;
}

export async function loadQuestions(subset: Subset): Promise<WixQuestion[]> {
  const out: WixQuestion[] = [];
  let i = 0;
  for await (const r of jsonl<{ question: string; article_ids?: string[] }>(`${WIX_DIR}/wixqa_${subset}__test.jsonl`))
    out.push({ id: `${subset}:${i++}`, subset, question: String(r.question).trim(), gold: [...new Set((r.article_ids ?? []).map(String))] });
  return out;
}

export async function loadPrimaryQuestions(): Promise<WixQuestion[]> {
  return [...(await loadQuestions("expertwritten")), ...(await loadQuestions("simulated"))];
}

export function toDocuments(articles: WixArticle[]): Document[] {
  const now = "2026-01-01T00:00:00.000Z";
  return articles.map((a) => {
    const content = a.contents.replace(/\r\n/g, "\n");
    return {
      id: `wix:${a.id}`,
      sourceId: `wixqa_${a.articleType}`,
      externalId: a.id,
      content,
      metadata: { title: a.title.trim() || a.id, kind: "markdown" },
      createdAt: now,
      updatedAt: now,
      version: 1,
      checksum: createHash("sha1").update(content).digest("hex"),
    };
  });
}

export const wixToOriginal = (id: string) => id.replace(/^wix:/, "");

/**
 * Nested manifests: all gold articles + largest-remainder proportional prefixes
 * (by article_type) of seeded permutations of the remaining non-empty articles
 * (the EnterpriseRAG source_type rule, PREREGISTRATION §2.2). The full scale is
 * every article.
 */
export function buildManifests(articles: WixArticle[], gold: Set<string>, scales: number[], seed: number) {
  const goldRows: number[] = [];
  const pool = new Map<string, { i: number; id: string }[]>();
  articles.forEach((a, i) => {
    if (gold.has(a.id)) goldRows.push(i);
    else if (a.contents.trim()) pool.set(a.articleType, [...(pool.get(a.articleType) ?? []), { i, id: a.id }]);
  });
  const rand = rng(seed);
  const types = [...pool.keys()].sort();
  const perms = new Map(types.map((t) => [t, shuffle(pool.get(t)!.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((x) => x.i), rand)]));
  const totalPool = types.reduce((s, t) => s + perms.get(t)!.length, 0);
  return scales.map((scale) => {
    const need = Math.min(totalPool, Math.max(0, scale - goldRows.length));
    const exact = types.map((t) => (perms.get(t)!.length / totalPool) * need);
    const alloc = exact.map(Math.floor);
    let rest = need - alloc.reduce((a, b) => a + b, 0);
    const order = exact.map((x, k) => [x - Math.floor(x), k] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; rest > 0; k++, rest--) alloc[order[k % order.length][1]]++;
    const rows = [...goldRows, ...types.flatMap((t, k) => perms.get(t)!.slice(0, alloc[k]))].sort((a, b) => a - b);
    return { requested: scale, scale: rows.length, seed, gold: goldRows.length, goldDensity: goldRows.length / rows.length, rows, sha256: createHash("sha256").update(rows.join(",")).digest("hex") };
  });
}

const contentWords = (s: string) => new Set(normalize(s).split(" ").filter((w) => w.length > 3));
function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

/**
 * 70/30 split, seeded, stratified by subset. Grouped (union-find): identical
 * gold sets, identical normalized text, near-duplicates (RadarDB integrity
 * rule: content-word Jaccard >= 0.6). A group's stratum is the subset of its
 * lexicographically first question id.
 */
export function makeSplit(questions: WixQuestion[], seed: number) {
  const parent = new Map<string, string>(questions.map((q) => [q.id, q.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const byKey = new Map<string, string>();
  for (const q of questions)
    for (const key of [`g:${[...q.gold].sort().join("|")}`, `q:${normalize(q.question)}`]) {
      if (byKey.has(key)) union(q.id, byKey.get(key)!);
      else byKey.set(key, q.id);
    }
  const words = questions.map((q) => contentWords(q.question));
  for (let i = 0; i < questions.length; i++) for (let j = i + 1; j < questions.length; j++) if (jaccard(words[i], words[j]) >= 0.6) union(questions[i].id, questions[j].id);
  const groups = new Map<string, WixQuestion[]>();
  for (const q of questions) groups.set(find(q.id), [...(groups.get(find(q.id)) ?? []), q]);
  const sorted = [...groups.values()].map((g) => g.sort((a, b) => (a.id < b.id ? -1 : 1))).sort((a, b) => (a[0].id < b[0].id ? -1 : 1));
  const rand = rng(seed);
  const assigned = new Map<string, "optimization" | "validation">();
  for (const subset of [...new Set(questions.map((q) => q.subset))].sort()) {
    const sg = sorted.filter((g) => g[0].subset === subset);
    const total = sg.reduce((s, g) => s + g.length, 0);
    const target = Math.round(total * 0.3);
    let held = 0;
    for (const g of shuffle(sg, rand)) {
      const split = held + g.length <= target || (held < target && held + g.length - target < target - held) ? "validation" : "optimization";
      if (split === "validation") held += g.length;
      for (const q of g) assigned.set(q.id, split);
    }
  }
  return {
    groups: groups.size,
    largestGroup: Math.max(...[...groups.values()].map((g) => g.length)),
    records: questions.map((q) => ({
      questionId: q.id,
      subset: q.subset,
      group: find(q.id),
      split: assigned.get(q.id)!,
      sha256: createHash("sha256").update(`${q.id}\u0000${q.question}\u0000${[...q.gold].sort().join(",")}`).digest("hex"),
    })),
  };
}

export function toHarnessQuestions(questions: WixQuestion[], split: { questionId: string; split: "optimization" | "validation" }[]): HarnessQuestion[] {
  const s = new Map(split.map((r) => [r.questionId, r.split]));
  return questions
    .filter((q) => s.has(q.id))
    .map((q) => ({
      id: q.id,
      question: q.question,
      questionClass: "unlabeled",
      requiredEvidence: [],
      split: s.get(q.id)!,
      provenance: "benchmark" as const,
      humanVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      goldDocIds: q.gold,
    }));
}
