import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { ControlError } from "./control";
import { UnsafePathError } from "./connectors/filesystem";

export function errorJson(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(req: Request): string {
  const host = req.headers.get("host");
  if (!host) {
    try {
      return new URL(req.url).hostname;
    } catch {
      return "";
    }
  }
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

/**
 * Control plane is local-only in V1: requests must target localhost unless
 * RADAR_ALLOW_REMOTE=1. Combined with binding the server to 127.0.0.1 this
 * also blocks DNS-rebinding attacks from web pages.
 */
export function guardControl(req: Request): NextResponse | null {
  if (process.env.RADAR_ALLOW_REMOTE === "1") return null;
  if (!LOCAL_HOSTS.has(hostname(req))) return errorJson("forbidden", "the control plane only accepts requests to localhost", 403);
  return null;
}

/** Data plane: if RADAR_API_KEY is set, require it as a bearer token; otherwise local-only like the control plane. */
export function guardData(req: Request): NextResponse | null {
  const key = process.env.RADAR_API_KEY;
  if (!key) return guardControl(req);
  const auth = req.headers.get("authorization") ?? "";
  const given = Buffer.from(auth.startsWith("Bearer ") ? auth.slice(7) : "");
  const want = Buffer.from(key);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return errorJson("unauthorized", "missing or invalid API key", 401);
  return null;
}

const MAX_BODY_BYTES = 25 * 1024 * 1024;

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) return { error: errorJson("too_large", "request body too large", 413) };
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: errorJson("invalid_json", "request body must be valid JSON", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return {
      error: errorJson(
        "invalid_request",
        "request failed validation",
        400,
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      ),
    };
  return { data: parsed.data };
}

/** Map thrown errors to JSON without leaking stack traces. */
export function handleError(e: unknown): NextResponse {
  if (e instanceof ControlError) return errorJson(e.code, e.message, e.status);
  if (e instanceof UnsafePathError) return errorJson("unsafe_path", e.message, 400);
  console.error("[radar]", e);
  return errorJson("internal", "internal error", 500);
}
