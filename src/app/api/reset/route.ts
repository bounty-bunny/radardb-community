import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";

export const dynamic = "force-dynamic";

/** Reset the workspace to the synthetic demo fixture (deletes runs, plans, logs). */
export function POST(req: Request) {
  return controlRoute(req, async (cp) => {
    await cp.resetDemo();
    return NextResponse.json({ ok: true });
  });
}
