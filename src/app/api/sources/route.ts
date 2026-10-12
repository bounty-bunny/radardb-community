import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";
import { parseBody } from "@/server/http";
import { SourceSchema } from "@/server/schemas";
import { sourcesRoot } from "@/server/control";
import path from "node:path";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return controlRoute(req, (cp) =>
    NextResponse.json({ sources: cp.state.sources, sourcesRoot: path.relative(process.cwd(), sourcesRoot()) || "." }),
  );
}

/** Connect a local folder (relative to the sources root) as a filesystem source. */
export function POST(req: Request) {
  return controlRoute(req, async (cp) => {
    const body = await parseBody(req, SourceSchema);
    if ("error" in body) return body.error;
    return NextResponse.json(await cp.addFilesystemSource(body.data.name, body.data.path), { status: 201 });
  });
}
