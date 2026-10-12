/**
 * Compare a reproduced locked evaluation with the sealed original, question by question.
 *   npx tsx --tsconfig research/v1.1/tsconfig.json research/v1.1/compare-reproduction.ts <original.json> <reproduced.json>
 * Works for erb-heldout.json and synthetic-test.json. Exit 0 = every question identical on Recall@5 for both systems.
 */
import fs from "node:fs";

type Rec = { id: string; global: { recall5: number; ranking?: string[] }; fusion: { recall5: number; ranking?: string[] } };
const [a, b] = process.argv.slice(2);
if (!a || !b) throw new Error("usage: compare-reproduction.ts <original.json> <reproduced.json>");
const load = (f: string) => new Map((JSON.parse(fs.readFileSync(f, "utf8")) as { records: Rec[] }).records.map((r) => [r.id, r]));
const o = load(a);
const r = load(b);
let same = 0;
let rankingSame = 0;
const diffs: string[] = [];
for (const [id, x] of o) {
  const y = r.get(id);
  if (!y) {
    diffs.push(`${id}: missing in reproduction`);
    continue;
  }
  if (x.global.recall5 === y.global.recall5 && x.fusion.recall5 === y.fusion.recall5) same++;
  else diffs.push(`${id}: global ${x.global.recall5}→${y.global.recall5}, fusion ${x.fusion.recall5}→${y.fusion.recall5}`);
  if (JSON.stringify(x.global.ranking) === JSON.stringify(y.global.ranking) && JSON.stringify(x.fusion.ranking) === JSON.stringify(y.fusion.ranking)) rankingSame++;
}
const mean = (m: Map<string, Rec>, k: "global" | "fusion") => [...m.values()].reduce((s, v) => s + v[k].recall5, 0) / m.size;
console.log(`questions ${o.size} · identical Recall@5 ${same}/${o.size} · identical rankings ${rankingSame}/${o.size}`);
console.log(`original   Global ${(mean(o, "global") * 100).toFixed(2)}%  Fusion ${(mean(o, "fusion") * 100).toFixed(2)}%`);
console.log(`reproduced Global ${(mean(r, "global") * 100).toFixed(2)}%  Fusion ${(mean(r, "fusion") * 100).toFixed(2)}%`);
for (const d of diffs.slice(0, 20)) console.log(`  diff ${d}`);
process.exit(same === o.size && r.size === o.size ? 0 : 1);
