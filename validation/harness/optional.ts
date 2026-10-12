/**
 * Load an optional sibling module that may not be present in every distribution
 * (e.g. calibration or dataset adapters whose source data cannot be redistributed).
 * Returns null when the file is absent; the path is computed so type-checking does
 * not require the module to exist.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function importOptional<T>(dir: string, file: string): Promise<T | null> {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return null;
  return (await import(pathToFileURL(p).href)) as T;
}
