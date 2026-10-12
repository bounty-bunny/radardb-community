import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { dataRoute } from "@/server/route";
import { parseBody } from "@/server/http";
import { FeedbackSchema } from "@/server/schemas";

export const dynamic = "force-dynamic";

/** DATA PLANE — POST /api/v1/feedback { requestId, useful, missingEvidence?, note? } */
export function POST(req: Request) {
  return dataRoute(req, async (cp) => {
    const body = await parseBody(req, FeedbackSchema);
    if ("error" in body) return body.error;
    const fb = { id: `fb_${randomUUID()}`, ...body.data, createdAt: new Date().toISOString() };
    cp.state.feedback.push(fb);
    cp.state.feedback = cp.state.feedback.slice(-5000);
    cp.store.save();
    return NextResponse.json(fb, { status: 201 });
  });
}
