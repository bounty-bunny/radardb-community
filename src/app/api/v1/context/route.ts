import { NextResponse } from "next/server";
import { dataRoute } from "@/server/route";
import { parseBody } from "@/server/http";
import { ContextRequestSchema } from "@/server/schemas";
import { serveContext } from "@/server/dataplane";

export const dynamic = "force-dynamic";

/**
 * DATA PLANE — POST /api/v1/context
 * { "query": "...", "constraints": { "maxTokens": 1200, "maxLatencyMs": 500 } }
 * Executes the deployed ContextPlan. Never optimizes.
 */
export function POST(req: Request) {
  return dataRoute(req, async (cp) => {
    const body = await parseBody(req, ContextRequestSchema);
    if ("error" in body) return body.error;
    return NextResponse.json(await serveContext(cp, body.data));
  });
}
