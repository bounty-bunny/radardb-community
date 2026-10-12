import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";
import { parseBody } from "@/server/http";
import { DeploySchema } from "@/server/schemas";

export const dynamic = "force-dynamic";

/** Explicitly deploy a validated release. Never called automatically. */
export function POST(req: Request) {
  return controlRoute(req, async (cp) => {
    const body = await parseBody(req, DeploySchema);
    if ("error" in body) return body.error;
    return NextResponse.json(cp.deploy(body.data.releaseId));
  });
}
