import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";
import { releaseView } from "@/server/views";

export const dynamic = "force-dynamic";

/** All releases (newest first) with their plans. */
export function GET(req: Request) {
  return controlRoute(req, (cp) =>
    NextResponse.json([...cp.state.releases].sort((a, b) => b.version - a.version).map((r) => releaseView(cp, r))),
  );
}
