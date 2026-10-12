import { NextResponse, type NextRequest } from "next/server";
import { controlRoute } from "@/server/route";
import { errorJson, parseBody } from "@/server/http";
import { QuestionSchema } from "@/server/schemas";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return controlRoute(req, (cp) =>
    NextResponse.json(
      cp.state.questions.map((q) => ({ ...q, routed: cp.router.route(q.question) })),
    ),
  );
}

export function POST(req: NextRequest) {
  return controlRoute(req, async (cp) => {
    const body = await parseBody(req, QuestionSchema);
    if ("error" in body) return body.error;
    return NextResponse.json(cp.addQuestion(body.data), { status: 201 });
  });
}

export function DELETE(req: NextRequest) {
  return controlRoute(req, (cp) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return errorJson("invalid_request", "id is required", 400);
    cp.removeQuestion(id);
    return NextResponse.json({ ok: true });
  });
}
