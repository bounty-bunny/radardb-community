import fs from "node:fs";
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

export async function parquetRowCount(file: string): Promise<number> {
  const meta = await parquetMetadataAsync(await asyncBufferFromFile(file));
  return Number(meta.num_rows);
}

/** Read rows in batches so a 1.3 GB file never has to be materialized at once. */
export async function* parquetBatches<T = Record<string, unknown>>(file: string, columns?: string[], batch = 20000): AsyncGenerator<T[]> {
  const buf = await asyncBufferFromFile(file);
  const total = await parquetRowCount(file);
  for (let start = 0; start < total; start += batch) {
    const rows = (await parquetReadObjects({ file: buf, columns, rowStart: start, rowEnd: Math.min(total, start + batch), compressors })) as T[];
    yield rows;
  }
}

export async function parquetAll<T = Record<string, unknown>>(file: string, columns?: string[]): Promise<T[]> {
  const out: T[] = [];
  for await (const b of parquetBatches<T>(file, columns)) out.push(...b);
  return out;
}

export function fileSize(file: string) {
  return fs.statSync(file).size;
}
