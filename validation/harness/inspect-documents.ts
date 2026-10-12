// Audit step A0: EnterpriseRAG-Bench documents (streaming, read-only).
import { createHash } from "node:crypto";
import { parquetAll, parquetBatches, parquetRowCount } from "./parquet";

const docsFile = "validation/data/enterpriserag/documents.parquet";
const questions = await parquetAll<{ question_id: string; expected_doc_ids: string[] | null }>("validation/data/enterpriserag/questions.parquet", [
  "question_id",
  "expected_doc_ids",
]);
const gold = new Set(questions.flatMap((q) => q.expected_doc_ids ?? []));

const total = await parquetRowCount(docsFile);
const ids = new Set<string>();
let dupIds = 0;
let empty = 0;
const bySource = new Map<string, { n: number; chars: number; max: number }>();
const contentHash = new Map<string, string>();
let dupContent = 0;
let goldDupContent = 0;
const goldFound = new Set<string>();
const goldChars: number[] = [];
const lengths: number[] = [];
let n = 0;
const t0 = Date.now();
for await (const rows of parquetBatches<{ doc_id: string; source_type: string; title: string; content: string }>(docsFile, undefined, 25000)) {
  for (const r of rows) {
    n++;
    if (ids.has(r.doc_id)) dupIds++;
    ids.add(r.doc_id);
    const c = r.content ?? "";
    if (!c.trim()) empty++;
    const s = bySource.get(r.source_type) ?? { n: 0, chars: 0, max: 0 };
    s.n++;
    s.chars += c.length;
    s.max = Math.max(s.max, c.length);
    bySource.set(r.source_type, s);
    lengths.push(c.length);
    const h = createHash("sha1").update(c).digest("hex");
    const prev = contentHash.get(h);
    if (prev) {
      dupContent++;
      if (gold.has(r.doc_id) || gold.has(prev)) goldDupContent++;
    } else contentHash.set(h, r.doc_id);
    if (gold.has(r.doc_id)) {
      goldFound.add(r.doc_id);
      goldChars.push(c.length);
    }
  }
  process.stdout.write(`\r${n}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
lengths.sort((a, b) => a - b);
const q = (p: number) => lengths[Math.floor(p * (lengths.length - 1))];
console.log(`\nrows ${total}  read ${n}  distinct ids ${ids.size}  dup ids ${dupIds}  empty content ${empty}`);
console.log(`content chars: total ${lengths.reduce((a, b) => a + b, 0)}  median ${q(0.5)}  p95 ${q(0.95)}  max ${q(1)}`);
for (const [s, v] of [...bySource].sort((a, b) => b[1].n - a[1].n))
  console.log(`  ${s.padEnd(14)} n ${String(v.n).padStart(7)}  mean chars ${Math.round(v.chars / v.n)}  max ${v.max}`);
console.log(`duplicate content (sha1) ${dupContent}  involving gold docs ${goldDupContent}`);
console.log(`gold ids ${gold.size}  found ${goldFound.size}  missing ${[...gold].filter((g) => !goldFound.has(g)).length}`);
console.log(`gold doc chars mean ${Math.round(goldChars.reduce((a, b) => a + b, 0) / goldChars.length)}  total ${goldChars.reduce((a, b) => a + b, 0)}`);
console.log(`peak rss ${Math.round(process.memoryUsage().rss / 1048576)} MB`);
