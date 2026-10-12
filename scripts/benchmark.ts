/**
 * Context Benchmark from the command line.
 *   npm run benchmark -- <folder-under-sources-root> <questions.json> [name]
 *
 * questions.json: [{ "question": "...", "requiredEvidence": ["exact phrase", ["alt a", "alt b"]] }, ...]
 * Writes a Markdown report to .radar/benchmarks/<id>/report.md.
 */
import fs from "node:fs";
import path from "node:path";
import { control, sourcesRoot } from "@/server/control";
import { FilesystemConnector } from "@/server/connectors/filesystem";
import { BenchmarkSchema } from "@/server/schemas";
import { reportMarkdown, startBenchmark } from "@/server/benchmark";

async function main() {
  const [folder, questionsFile, name] = process.argv.slice(2);
  if (!folder || !questionsFile) throw new Error("usage: npm run benchmark -- <folder> <questions.json> [name]");
  const connector = new FilesystemConnector(sourcesRoot(), folder);
  const docs = await connector.getDocuments();
  const input = BenchmarkSchema.parse({
    name: name ?? folder,
    documents: docs.map((d) => ({ title: d.title, content: d.content, path: d.externalId })),
    questions: JSON.parse(fs.readFileSync(questionsFile, "utf8")),
  });
  const cp = await control();
  const b = startBenchmark(cp, input);
  console.log(`benchmark ${b.id}: ${input.documents.length} documents, ${input.questions.length} questions`);
  while (b.status === "running") {
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`  ${b.progress.stage} ${b.progress.done}/${b.progress.total}`);
  }
  if (b.status !== "completed") throw new Error(b.error);
  const out = path.join(cp.store.benchmarkDir(b.id), "report.md");
  fs.writeFileSync(out, reportMarkdown(b));
  console.log(`\nreport: ${out}\n`);
  console.log(reportMarkdown(b));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
