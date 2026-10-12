/**
 * EnterpriseRAG-Bench adapter (PREREGISTRATION §2, §3). Converts benchmark
 * documents/questions into RadarDB's canonical types without changing meaning.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Document } from "@/core/domain";
import { parquetAll, parquetBatches } from "../parquet";
import type { HarnessQuestion } from "../scorers";

export const ERB_DIR = `${process.env.RADAR_ROOT ?? process.cwd()}/validation/data/enterpriserag`;
export const SCALES = [2000, 10000, 25000, 50000, 100000] as const;

export interface ErbQuestion {
  question_id: string;
  question_type: string;
  question: string;
  expected_doc_ids: string[] | null;
}

export async function loadQuestions(): Promise<ErbQuestion[]> {
  return parquetAll<ErbQuestion>(`${ERB_DIR}/questions.parquet`, ["question_id", "question_type", "question", "expected_doc_ids"]);
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Manifest {
  scale: number;
  seed: number;
  gold: number;
  distractors: number;
  goldDensity: number;
  /** Row indices into documents.parquet (rows, not doc_ids: doc_ids are not unique). */
  rows: number[];
  sha256: string;
}

/**
 * Nested manifests: all gold rows + proportional per-source-type prefixes of
 * a seeded permutation of eligible distractor rows (non-gold, non-empty).
 */
export async function buildManifests(seed: number, gold: Set<string>): Promise<{ manifests: Manifest[]; poolBySource: Record<string, number> }> {
  const goldRows: number[] = [];
  const pool = new Map<string, { row: number; id: string }[]>();
  let row = 0;
  for await (const rows of parquetBatches<{ doc_id: string; source_type: string; content: string }>(`${ERB_DIR}/documents.parquet`, ["doc_id", "source_type", "content"], 25000)) {
    for (const r of rows) {
      if (gold.has(r.doc_id)) goldRows.push(row);
      else if ((r.content ?? "").trim()) pool.set(r.source_type, [...(pool.get(r.source_type) ?? []), { row, id: r.doc_id }]);
      row++;
    }
  }
  const rand = rng(seed);
  const perms = new Map<string, number[]>();
  for (const s of [...pool.keys()].sort())
    perms.set(
      s,
      shuffle(
        pool.get(s)!.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.row - b.row)).map((x) => x.row),
        rand,
      ),
    );
  const totalPool = [...pool.values()].reduce((a, b) => a + b.length, 0);
  const manifests: Manifest[] = [];
  for (const scale of SCALES) {
    const need = scale - goldRows.length;
    // Largest-remainder proportional allocation per source type.
    const sources = [...perms.keys()];
    const exact = sources.map((s) => (perms.get(s)!.length / totalPool) * need);
    const alloc = exact.map(Math.floor);
    let rest = need - alloc.reduce((a, b) => a + b, 0);
    const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; rest > 0; k++, rest--) alloc[order[k % order.length][1]]++;
    const rows = [...goldRows, ...sources.flatMap((s, i) => perms.get(s)!.slice(0, alloc[i]))].sort((a, b) => a - b);
    manifests.push({
      scale,
      seed,
      gold: goldRows.length,
      distractors: rows.length - goldRows.length,
      goldDensity: gold.size / rows.length,
      rows,
      sha256: createHash("sha256").update(rows.join(",")).digest("hex"),
    });
  }
  return { manifests, poolBySource: Object.fromEntries([...pool].map(([k, v]) => [k, v.length])) };
}

/** Materialize RadarDB Documents for a manifest. Duplicate doc_ids get #1/#2 suffixes (PREREGISTRATION §2.3). */
export async function loadCorpus(manifest: Manifest): Promise<{ documents: Document[]; toOriginal: (id: string) => string }> {
  const wanted = new Set(manifest.rows);
  const docs: Document[] = [];
  const seenIds = new Map<string, number>();
  let row = 0;
  const now = "2026-01-01T00:00:00.000Z";
  for await (const rows of parquetBatches<{ doc_id: string; source_type: string; title: string; content: string }>(`${ERB_DIR}/documents.parquet`, undefined, 25000)) {
    for (const r of rows) {
      if (wanted.has(row)) {
        const n = (seenIds.get(r.doc_id) ?? 0) + 1;
        seenIds.set(r.doc_id, n);
        const content = (r.content ?? "").replace(/\r\n/g, "\n");
        docs.push({
          id: `erb:${r.doc_id}#${n}`,
          sourceId: `erb_${r.source_type}`,
          externalId: r.doc_id,
          content,
          metadata: { title: r.title ?? r.doc_id, kind: "markdown", sourceType: r.source_type },
          createdAt: now,
          updatedAt: now,
          version: 1,
          checksum: createHash("sha1").update(content).digest("hex"),
        });
      }
      row++;
    }
  }
  return { documents: docs, toOriginal: (id) => id.replace(/^erb:/, "").replace(/#\d+$/, "") };
}

export interface SplitRecord {
  questionId: string;
  split: "optimization" | "validation";
  questionType: string;
  sha256: string;
}

/**
 * 70/30 split, seeded, stratified by question_type. Questions with an
 * identical gold set form one group and are assigned together.
 */
export function makeSplit(questions: ErbQuestion[], seed: number): SplitRecord[] {
  const scorable = questions.filter((q) => (q.expected_doc_ids ?? []).length > 0);
  const goldKey = (q: ErbQuestion) => [...(q.expected_doc_ids ?? [])].sort().join("|");
  const groups = new Map<string, ErbQuestion[]>();
  for (const q of scorable) groups.set(goldKey(q), [...(groups.get(goldKey(q)) ?? []), q]);
  const rand = rng(seed);
  const assigned = new Map<string, "optimization" | "validation">();
  for (const type of [...new Set(scorable.map((q) => q.question_type))].sort()) {
    const typeGroups = [...groups.values()].filter((g) => g[0].question_type === type).sort((a, b) => (a[0].question_id < b[0].question_id ? -1 : 1));
    const total = typeGroups.reduce((s, g) => s + g.length, 0);
    const target = Math.round(total * 0.3);
    let held = 0;
    for (const g of shuffle(typeGroups, rand)) {
      const split = held + g.length <= target || (held < target && held + g.length - target < target - held) ? "validation" : "optimization";
      if (split === "validation") held += g.length;
      for (const q of g) assigned.set(q.question_id, split);
    }
  }
  return scorable.map((q) => ({
    questionId: q.question_id,
    split: assigned.get(q.question_id)!,
    questionType: q.question_type,
    sha256: createHash("sha256")
      .update(`${q.question_id}\u0000${q.question}\u0000${[...(q.expected_doc_ids ?? [])].sort().join(",")}`)
      .digest("hex"),
  }));
}

export function toHarnessQuestions(questions: ErbQuestion[], split: SplitRecord[]): HarnessQuestion[] {
  const s = new Map(split.map((r) => [r.questionId, r.split]));
  return questions
    .filter((q) => s.has(q.question_id))
    .map((q) => ({
      id: q.question_id,
      question: q.question,
      questionClass: q.question_type,
      requiredEvidence: [],
      split: s.get(q.question_id)!,
      provenance: "benchmark" as const,
      humanVerified: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      goldDocIds: [...new Set(q.expected_doc_ids ?? [])],
      category: q.question_type,
    }));
}

export function readJson<T>(f: string): T {
  return JSON.parse(fs.readFileSync(f, "utf8")) as T;
}
