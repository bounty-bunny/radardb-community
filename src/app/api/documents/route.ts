import { NextResponse, type NextRequest } from "next/server";
import { controlRoute } from "@/server/route";
import { errorJson, parseBody } from "@/server/http";
import { UploadSchema } from "@/server/schemas";
import { docSummary } from "@/server/views";

export const dynamic = "force-dynamic";

/** GET ?id=… returns one document (content as plain text); otherwise summaries, optionally ?sourceId=… */
export function GET(req: NextRequest) {
  return controlRoute(req, (cp) => {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const d = cp.state.documents.find((x) => x.id === id);
      return d ? NextResponse.json({ ...docSummary(d), content: d.content, checksum: d.checksum }) : errorJson("not_found", "document not found", 404);
    }
    const sourceId = req.nextUrl.searchParams.get("sourceId");
    return NextResponse.json(cp.state.documents.filter((d) => !sourceId || d.sourceId === sourceId).map(docSummary));
  });
}

export function POST(req: NextRequest) {
  return controlRoute(req, async (cp) => {
    const body = await parseBody(req, UploadSchema);
    if ("error" in body) return body.error;
    return NextResponse.json(docSummary(cp.addUpload(body.data.title, body.data.content)), { status: 201 });
  });
}

export function DELETE(req: NextRequest) {
  return controlRoute(req, (cp) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return errorJson("invalid_request", "id is required", 400);
    cp.removeDocument(id);
    return NextResponse.json({ ok: true });
  });
}
