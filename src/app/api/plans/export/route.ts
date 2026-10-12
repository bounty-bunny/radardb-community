import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";
import { ControlError } from "@/server/control";
import { toPortableRelease } from "@/core/portable";

export const dynamic = "force-dynamic";

/**
 * CONTROL PLANE — GET /api/plans/export?releaseId=<id>
 * A plan release as a portable, versioned `radardb.plan-release` v1 document.
 * Without `releaseId`: the deployed release, else the latest one.
 */
export function GET(req: Request) {
  return controlRoute(req, (cp) => {
    const id = new URL(req.url).searchParams.get("releaseId");
    const releases = [...cp.state.releases].sort((a, b) => b.version - a.version);
    const release = id ? releases.find((r) => r.id === id) : (cp.deployedRelease() ?? releases[0]);
    if (!release) throw new ControlError(id ? "release_not_found" : "no_release", id ? `release ${id} not found` : "no plan release exists yet; run the optimizer first", 404);
    const doc = toPortableRelease(release, cp.plansOf(release), new Date().toISOString());
    return NextResponse.json(doc, { headers: { "content-disposition": `attachment; filename="radardb-plan-release-v${release.version}.json"` } });
  });
}
