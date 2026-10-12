import fs from "node:fs";
import path from "node:path";
import type { SourceKind } from "@/core/domain";
import { sha1 } from "@/engine/text";
import type { ConnectorChanges, ConnectorDocument, ConnectorHealth, SourceConnector } from "./types";

export const ALLOWED_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILES = 5000;

export class UnsafePathError extends Error {}

/**
 * Resolve `relPath` inside `root`, refusing anything that escapes it
 * (../, absolute paths, drive letters, symlinked directories).
 */
export function resolveInside(root: string, relPath: string): string {
  if (!relPath || /\0/.test(relPath)) throw new UnsafePathError("empty or invalid path");
  if (path.isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) throw new UnsafePathError("absolute paths are not allowed");
  const rootReal = fs.realpathSync(path.resolve(root));
  const target = path.resolve(rootReal, relPath);
  const rel = path.relative(rootReal, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new UnsafePathError("path escapes the sources root");
  if (!fs.existsSync(target)) throw new UnsafePathError("path does not exist");
  const real = fs.realpathSync(target);
  const realRel = path.relative(rootReal, real);
  if (realRel.startsWith("..") || path.isAbsolute(realRel)) throw new UnsafePathError("path resolves outside the sources root (symlink)");
  return real;
}

/** First markdown heading, else the file name. */
function titleOf(content: string, file: string): string {
  const h = /^#\s+(.+)$/m.exec(content);
  return (h ? h[1] : path.basename(file).replace(/\.[^.]+$/, "")).trim().slice(0, 200);
}

/**
 * Reads Markdown / text files from a directory under the configured sources
 * root. Read-only; never follows symlinks; skips dotfiles and node_modules.
 */
export class FilesystemConnector implements SourceConnector {
  readonly type = "filesystem" as const;
  private dir = "";

  constructor(
    private root: string,
    private relPath: string,
    private kind: SourceKind = "markdown",
  ) {}

  async connect() {
    this.dir = resolveInside(this.root, this.relPath);
    if (!fs.statSync(this.dir).isDirectory()) throw new UnsafePathError("not a directory");
  }

  async validate() {
    try {
      await this.connect();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  private walk(dir: string, out: string[]) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) this.walk(full, out);
      else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
      if (out.length > MAX_FILES) throw new Error(`more than ${MAX_FILES} files`);
    }
  }

  async getDocuments(): Promise<ConnectorDocument[]> {
    if (!this.dir) await this.connect();
    const files: string[] = [];
    this.walk(this.dir, files);
    const docs: ConnectorDocument[] = [];
    for (const f of files.sort()) {
      const st = fs.statSync(f);
      if (st.size > MAX_FILE_BYTES) continue;
      const content = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      docs.push({
        externalId: path.relative(this.dir, f).split(path.sep).join("/"),
        title: titleOf(content, f),
        content,
        kind: this.kind,
        updatedAt: st.mtime.toISOString(),
      });
    }
    return docs;
  }

  sync() {
    return this.getDocuments();
  }

  async getChanges(known: Map<string, string>): Promise<ConnectorChanges> {
    const docs = await this.getDocuments();
    const present = new Set(docs.map((d) => d.externalId));
    return {
      upserts: docs.filter((d) => known.get(d.externalId) !== sha1(d.content)),
      deletes: [...known.keys()].filter((k) => !present.has(k)),
    };
  }

  incrementalSync(known: Map<string, string>) {
    return this.getChanges(known);
  }

  async health(): Promise<ConnectorHealth> {
    const v = await this.validate();
    return v.ok ? { status: "ok", detail: `reading ${this.relPath}` } : { status: "unreachable", detail: v.error ?? "unknown error" };
  }
}
