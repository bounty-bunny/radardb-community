import type { Chunk, ChunkingStrategy, Document, SourceKind } from "@/core/domain";
import { estTokens } from "./text";
import { extractEntities } from "./entities";

export interface Chunker {
  readonly strategy: ChunkingStrategy;
  chunk(doc: Document): Chunk[];
}

function makeChunk(strategy: ChunkingStrategy, doc: Document, index: number, content: string): Chunk {
  return {
    id: `${strategy}:${doc.id}:${index}`,
    documentId: doc.id,
    strategy,
    content,
    tokenCount: estTokens(content),
    metadata: {
      index,
      title: doc.metadata.title,
      sourceId: doc.sourceId,
      sourceKind: doc.metadata.kind as SourceKind,
      entities: extractEntities(content),
    },
  };
}

/** Naive sliding window over whitespace-delimited words: what most RAG tutorials ship. */
export class FixedChunker implements Chunker {
  constructor(
    readonly strategy: ChunkingStrategy,
    private sizeTokens: number,
    private overlapTokens: number,
  ) {}

  chunk(doc: Document): Chunk[] {
    const words = doc.content.split(/(?<=\s)/); // keep whitespace attached so tables survive
    const per = Math.round(this.sizeTokens * 0.75);
    const stride = per - Math.round(this.overlapTokens * 0.75);
    const chunks: Chunk[] = [];
    for (let start = 0, i = 0; start < words.length; start += stride, i++) {
      const text = words.slice(start, start + per).join("").trim();
      if (text) chunks.push(makeChunk(this.strategy, doc, i, text));
      if (start + per >= words.length) break;
    }
    return chunks;
  }
}

const SECTION_MAX = 380;

/** Structure-aware: one chunk per markdown section, prefixed with title and heading path; tables split into row groups. */
export class SectionChunker implements Chunker {
  readonly strategy = "section" as const;

  chunk(doc: Document): Chunk[] {
    const chunks: Chunk[] = [];
    let i = 0;
    for (const s of sections(doc.content)) {
      const crumb = [doc.metadata.title, ...s.path.slice(1)].filter(Boolean).join(" › ");
      for (const part of splitSection(s.body)) chunks.push(makeChunk(this.strategy, doc, i++, `${crumb}\n${part}`));
    }
    return chunks;
  }
}

/** Small overlapping windows of sentences / lines, prefixed with the document title. */
export class SentenceWindowChunker implements Chunker {
  readonly strategy = "sentence-window" as const;

  constructor(
    private window = 3,
    private stride = 2,
  ) {}

  chunk(doc: Document): Chunk[] {
    const units: string[] = [];
    for (const line of doc.content.split("\n")) {
      const l = line.trim();
      if (!l || /^\|?\s*-{3}/.test(l) || /^#{1,4}\s/.test(l)) continue;
      if (l.startsWith("|") || l.startsWith("-") || /^\d+[.)]\s/.test(l) || /^\d{2}:\d{2}\s/.test(l)) units.push(l);
      else units.push(...l.split(/(?<=[.!?])\s+(?=[A-Z0-9])/));
    }
    const chunks: Chunk[] = [];
    for (let start = 0, i = 0; start < units.length; start += this.stride, i++) {
      chunks.push(makeChunk(this.strategy, doc, i, `${doc.metadata.title}\n${units.slice(start, start + this.window).join("\n")}`));
      if (start + this.window >= units.length) break;
    }
    return chunks;
  }
}

export const CHUNKERS: Record<ChunkingStrategy, Chunker> = {
  "fixed-512": new FixedChunker("fixed-512", 512, 64),
  "fixed-256": new FixedChunker("fixed-256", 256, 32),
  section: new SectionChunker(),
  "sentence-window": new SentenceWindowChunker(),
};

interface Section {
  path: string[];
  body: string;
}

function sections(content: string): Section[] {
  const out: Section[] = [];
  const path: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) out.push({ path: [...path], body });
    buf = [];
  };
  for (const line of content.split("\n")) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      path.length = level - 1;
      path[level - 1] = h[2].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

function splitSection(body: string): string[] {
  const units: string[] = [];
  for (const p of body.split(/\n\s*\n/)) {
    const lines = p.split("\n");
    if (lines.length > 3 && lines.every((l) => l.trim().startsWith("|"))) {
      const header = lines.slice(0, 2).join("\n");
      const rows = lines.slice(2);
      for (let i = 0; i < rows.length; i += 4) units.push(header + "\n" + rows.slice(i, i + 4).join("\n"));
    } else if (estTokens(p) > SECTION_MAX) {
      units.push(...p.split("\n").filter((l) => l.trim()));
    } else {
      units.push(p);
    }
  }
  const groups: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && estTokens(cur + "\n\n" + u) > SECTION_MAX) {
      groups.push(cur);
      cur = u;
    } else {
      cur = cur ? cur + "\n\n" + u : u;
    }
  }
  if (cur) groups.push(cur);
  return groups;
}
