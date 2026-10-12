import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), ".radar", "cache");

/** A string-keyed cache persisted as JSON, flushed explicitly. Survives dev-server reloads via globalThis. */
export class DiskCache<V> {
  private map: Map<string, V>;
  private dirty = false;
  private file: string;

  constructor(
    name: string,
    private encode: (v: V) => unknown = (v) => v,
    private decode: (raw: unknown) => V = (raw) => raw as V,
  ) {
    this.file = path.join(DIR, `${name}.json`);
    this.map = new Map();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) this.map.set(k, this.decode(v));
    } catch {
      // first run or unreadable cache: start empty
    }
  }

  get(k: string): V | undefined {
    return this.map.get(k);
  }

  set(k: string, v: V) {
    this.map.set(k, v);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    fs.mkdirSync(DIR, { recursive: true });
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.map) obj[k] = this.encode(v);
    fs.writeFileSync(this.file, JSON.stringify(obj));
    this.dirty = false;
  }
}

export function f32ToB64(v: Float32Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
}

export function b64ToF32(raw: unknown): Float32Array {
  const buf = Buffer.from(String(raw), "base64");
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export function singleton<T>(key: string, make: () => T): T {
  const g = globalThis as unknown as Record<string, T>;
  if (!g[key]) g[key] = make();
  return g[key];
}
