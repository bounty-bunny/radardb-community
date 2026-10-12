import fs from "node:fs";
import path from "node:path";
import type { SourceKind } from "@/core/domain";
import { sha1 } from "@/engine/text";
import type { ConnectorChanges, ConnectorDocument, ConnectorHealth, SourceConnector } from "./types";

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw.replace(/\r\n/g, "\n") };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return { meta, body: m[2].replace(/\r\n/g, "\n") };
}

/**
 * SYNTHETIC demo data. Reads the bundled fixture files for one source kind.
 * Files under `generated/` are distractors and are marked as such so the
 * integrity checks can verify they never contain answers.
 */
export class FixtureConnector implements SourceConnector {
  readonly type = "fixture" as const;

  constructor(
    private dir: string,
    private kind: SourceKind,
  ) {}

  async connect() {}

  async validate() {
    return fs.existsSync(this.dir) ? { ok: true } : { ok: false, error: "fixture directory missing" };
  }

  async getDocuments(): Promise<ConnectorDocument[]> {
    const out: ConnectorDocument[] = [];
    for (const sub of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(this.dir, sub.name)).sort()) {
        if (!f.endsWith(".md")) continue;
        const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(this.dir, sub.name, f), "utf8"));
        if ((meta.source ?? "") !== this.kind) continue;
        out.push({
          externalId: `${sub.name}/${f.replace(/\.md$/, "")}`,
          title: meta.title ?? f,
          content: body.trim(),
          kind: this.kind,
          updatedAt: meta.updated ? new Date(meta.updated).toISOString() : new Date(0).toISOString(),
          metadata: { distractor: sub.name === "generated" },
        });
      }
    }
    return out;
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
    return { status: "ok", detail: "synthetic fixture bundled with RadarDB" };
  }
}
