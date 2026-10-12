export interface Hit {
  i: number;
  score: number;
}

export class BM25 {
  private df = new Map<string, number>();
  private tf: Map<string, number>[] = [];
  private len: number[] = [];
  private avgLen = 0;

  constructor(
    docs: string[][],
    private k1 = 1.2,
    private b = 0.75,
  ) {
    for (const toks of docs) {
      const m = new Map<string, number>();
      for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.tf.push(m);
      this.len.push(toks.length);
    }
    this.avgLen = this.len.reduce((a, b) => a + b, 0) / Math.max(1, docs.length);
  }

  search(query: string[], n: number): Hit[] {
    const N = this.tf.length;
    const terms = [...new Set(query)];
    const hits: Hit[] = [];
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (const t of terms) {
        const f = this.tf[i].get(t);
        if (!f) continue;
        const df = this.df.get(t)!;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.len[i]) / this.avgLen));
      }
      if (s > 0) hits.push({ i, score: s });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, n);
  }
}

export function denseSearch(vectors: Float32Array[], q: Float32Array, n: number): Hit[] {
  const hits = vectors.map((v, i) => {
    let s = 0;
    for (let d = 0; d < v.length; d++) s += v[d] * q[d];
    return { i, score: s };
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, n);
}

/** Reciprocal rank fusion: robust to the very different score scales of BM25 and cosine. */
export function rrf(lists: Hit[][], n: number, k = 60): Hit[] {
  const acc = new Map<number, number>();
  for (const list of lists) list.forEach((h, rank) => acc.set(h.i, (acc.get(h.i) ?? 0) + 1 / (k + rank + 1)));
  return [...acc.entries()]
    .map(([i, score]) => ({ i, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
