import { NextResponse, type NextRequest } from "next/server";
import { controlRoute } from "@/server/route";

export const dynamic = "force-dynamic";

/** Recent production ContextRequests (references only; no document content). */
export function GET(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50));
  return controlRoute(req, (cp) => NextResponse.json(cp.store.recentRequests(limit)));
}
