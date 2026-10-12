import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";
import { errorJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return controlRoute(req, (cp) => {
    const run = id === "latest" ? (cp.activeRun() ?? cp.state.runs[0]) : cp.state.runs.find((r) => r.id === id);
    return run ? NextResponse.json(run) : errorJson("not_found", "run not found", 404);
  });
}
