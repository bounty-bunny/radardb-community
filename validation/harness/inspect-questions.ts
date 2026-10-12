// Audit step A0: EnterpriseRAG-Bench questions (read-only inspection).
import { parquetAll, parquetRowCount } from "./parquet";

const file = "validation/data/enterpriserag/questions.parquet";
const rows = await parquetAll<Record<string, unknown>>(file);
console.log("rows", await parquetRowCount(file), "columns", Object.keys(rows[0]));
console.log("sample", JSON.stringify(rows[0], null, 1).slice(0, 1200));

const byType = new Map<string, { n: number; empty: number; gold: number[] }>();
const ids = new Set<string>();
const texts = new Set<string>();
let dupIds = 0;
let dupText = 0;
for (const r of rows) {
  const t = String(r.question_type);
  const gold = (r.expected_doc_ids as string[] | null) ?? [];
  const e = byType.get(t) ?? { n: 0, empty: 0, gold: [] };
  e.n++;
  if (!gold.length) e.empty++;
  e.gold.push(gold.length);
  byType.set(t, e);
  if (ids.has(String(r.question_id))) dupIds++;
  ids.add(String(r.question_id));
  const norm = String(r.question).toLowerCase().replace(/\s+/g, " ").trim();
  if (texts.has(norm)) dupText++;
  texts.add(norm);
}
for (const [t, e] of [...byType].sort((a, b) => b[1].n - a[1].n))
  console.log(
    t.padEnd(28),
    "n",
    e.n,
    "empty-gold",
    e.empty,
    "gold mean",
    (e.gold.reduce((a, b) => a + b, 0) / e.n).toFixed(2),
    "max",
    Math.max(...e.gold),
  );
const allGold = new Set(rows.flatMap((r) => (r.expected_doc_ids as string[] | null) ?? []));
console.log("dup question ids", dupIds, "dup question text", dupText, "distinct gold docs", allGold.size);
console.log("scorable questions", rows.filter((r) => ((r.expected_doc_ids as string[] | null) ?? []).length > 0).length);
