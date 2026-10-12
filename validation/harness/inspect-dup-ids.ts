// Audit step A0: which doc_ids are duplicated, and do the copies differ?
import { createHash } from "node:crypto";
import { parquetAll, parquetBatches } from "./parquet";

const qs = await parquetAll<{ expected_doc_ids: string[] | null }>("validation/data/enterpriserag/questions.parquet", ["expected_doc_ids"]);
const gold = new Set(qs.flatMap((q) => q.expected_doc_ids ?? []));
const seen = new Map<string, string[]>();
for await (const rows of parquetBatches<{ doc_id: string; source_type: string; content: string }>("validation/data/enterpriserag/documents.parquet", ["doc_id", "source_type", "content"], 25000))
  for (const r of rows) {
    const h = `${r.source_type}:${createHash("sha1").update(r.content ?? "").digest("hex").slice(0, 10)}:${(r.content ?? "").length}`;
    seen.set(r.doc_id, [...(seen.get(r.doc_id) ?? []), h]);
  }
for (const [id, hs] of seen) if (hs.length > 1) console.log(id, gold.has(id) ? "GOLD" : "not-gold", hs.join(" | "));
for (const [id, hs] of seen) if (hs.some((h) => h.endsWith(":0"))) console.log("empty:", id, gold.has(id) ? "GOLD" : "not-gold");
