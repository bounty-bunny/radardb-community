import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";

export const dynamic = "force-dynamic";

/** Redeploy the previously deployed release. */
export function POST(req: Request) {
  return controlRoute(req, (cp) => NextResponse.json(cp.rollback()));
}
