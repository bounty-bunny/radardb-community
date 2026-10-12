"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal data hook: fetch JSON, optional polling, manual refresh. */
export function useJson<T>(url: string | null, opts: { pollMs?: number | ((data: T | undefined) => number | null) } = {}) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message ?? res.statusText);
      setData(json as T);
      setError(undefined);
      return json as T;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const loop = async () => {
      const json = await load();
      const p = optsRef.current.pollMs;
      const ms = typeof p === "function" ? p(json) : p;
      if (alive && ms) timer = setTimeout(loop, ms);
    };
    loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  return { data, error, refresh: load };
}

export async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = json?.error?.details as { path: string; message: string }[] | undefined;
    throw new Error((json?.error?.message ?? res.statusText) + (details?.length ? `: ${details.map((d) => `${d.path} ${d.message}`).join("; ")}` : ""));
  }
  return json as T;
}

export const fmt = {
  pct: (x: number | undefined | null, digits = 1) => (x == null ? "—" : `${(x * 100).toFixed(digits)}%`),
  pts: (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)} pts`,
  usd: (x: number | undefined | null) => (x == null ? "—" : `$${x < 0.01 ? x.toFixed(5) : x.toFixed(3)}`),
  ms: (x: number | undefined | null) => (x == null ? "—" : x >= 1000 ? `${(x / 1000).toFixed(2)} s` : x >= 10 ? `${Math.round(x)} ms` : `${x.toFixed(1)} ms`),
  tokens: (x: number | undefined | null) => (x == null ? "—" : Math.round(x).toLocaleString()),
  ci: (ci: [number, number] | undefined) => (ci ? `${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)}%` : "—"),
  rel: (iso: string | undefined) => {
    if (!iso) return "—";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString();
  },
  change: (before: number, after: number) => (before ? (after - before) / before : 0),
};
