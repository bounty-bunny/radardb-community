import fs from "node:fs";
import readline from "node:readline";

/** Stream a JSON Lines file, skipping blank lines. */
export async function* jsonl<T>(file: string): AsyncGenerator<T> {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line) as T;
}
