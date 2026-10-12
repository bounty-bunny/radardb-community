import { NextResponse } from "next/server";
import { controlRoute } from "@/server/route";
import { parseBody } from "@/server/http";
import { PlaygroundSchema } from "@/server/schemas";
import { runConfig, serveContext } from "@/server/dataplane";
import { BASELINE_CONFIG } from "@/engine/optimizer/space";
import { scoreContext } from "@/engine/evaluate";
import { normalize } from "@/engine/text";
import { describePlan } from "@/engine/labels";

export const dynamic = "force-dynamic";

/**
 * Control-plane debugging tool: typical retrieval vs the deployed plan for one
 * query, with full traces. Not logged as production traffic. If the query is
 * in the eval set, required evidence is checked AFTER retrieval, for display.
 */
export function POST(req: Request) {
  return controlRoute(req, async (cp) => {
    const body = await parseBody(req, PlaygroundSchema);
    if ("error" in body) return body.error;
    const { query, constraints } = body.data;
    const baseline = await runConfig(cp, BASELINE_CONFIG, query, constraints);
    const deployed = cp.deployedRelease() ? await serveContext(cp, { query, constraints }, { log: false }) : null;
    const known = cp.state.questions.find((q) => normalize(q.question) === normalize(query));
    const evidence = known
      ? {
          questionId: known.id,
          split: known.split,
          facts: known.requiredEvidence.map((e) => (Array.isArray(e) ? e[0] : e)),
          baseline: scoreContext(baseline.items.map((i) => i.text), known.requiredEvidence),
          deployed: deployed ? scoreContext(deployed.context.map((i) => i.text), known.requiredEvidence) : null,
        }
      : null;
    return NextResponse.json({
      baseline: {
        context: baseline.items,
        strategy: describePlan(BASELINE_CONFIG),
        trace: baseline.trace,
        metrics: {
          measuredLatencyMs: Number(baseline.measuredLatencyMs.toFixed(2)),
          contextTokens: baseline.tokens,
          estimatedCostUsd: baseline.estimatedCostUsd,
        },
      },
      deployed,
      evidence,
    });
  });
}
