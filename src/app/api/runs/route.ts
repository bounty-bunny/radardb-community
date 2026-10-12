import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";
import { parseBody } from "@/server/http";
import { RunSchema } from "@/server/schemas";
import { runSummary } from "@/server/views";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return controlRoute(req, (cp) => NextResponse.json(cp.state.runs.map(runSummary)));
}

/** Start an optimizer run (asynchronous; poll GET /api/runs/:id). */
export function POST(req: Request) {
  return controlRoute(req, async (cp) => {
    const body = await parseBody(req, RunSchema);
    if ("error" in body) return body.error;
    const { objective, strategy, samples, constraints } = body.data;
    const run = cp.startRun({ objective, strategy, samples, constraints });
    return NextResponse.json(runSummary(run), { status: 202 });
  });
}
