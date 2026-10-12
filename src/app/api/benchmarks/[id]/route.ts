import { NextResponse, type NextRequest } from "next/server";
import { controlRoute } from "@/server/route";
import { errorJson } from "@/server/http";
import { reportMarkdown } from "@/server/benchmark";

export const dynamic = "force-dynamic";

/** GET /api/benchmarks/:id (?format=md for a Markdown report). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return controlRoute(req, (cp) => {
    const b = cp.state.benchmarks.find((x) => x.id === id);
    if (!b) return errorJson("not_found", "benchmark not found", 404);
    if (req.nextUrl.searchParams.get("format") === "md")
      return new NextResponse(reportMarkdown(b), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${b.id}.md"`,
        },
      }) as NextResponse;
    return NextResponse.json(b);
  });
}
