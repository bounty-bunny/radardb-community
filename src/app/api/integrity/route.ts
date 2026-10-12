import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return controlRoute(req, (cp) => NextResponse.json(cp.integrity()));
}
