import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";

export const dynamic = "force-dynamic";

/** POST /api/sources/:id → sync now. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return controlRoute(req, async (cp) => NextResponse.json(await cp.syncSource(id)));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return controlRoute(req, (cp) => {
    cp.removeSource(id);
    return NextResponse.json({ ok: true });
  });
}
