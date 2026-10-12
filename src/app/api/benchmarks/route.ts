import { NextResponse } from "next/server";
import { z } from "zod";
import { controlRoute } from "@/server/route";
import { parseBody } from "@/server/http";
import { BenchmarkSchema, WorkspaceBenchmarkSchema } from "@/server/schemas";
import { startBenchmark, type BenchmarkInput } from "@/server/benchmark";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return controlRoute(req, (cp) => NextResponse.json(cp.state.benchmarks));
}

/** Start a Context Benchmark on supplied documents + questions (isolated from the workspace). */
export function POST(req: Request) {
  return controlRoute(req, async (cp) => {
    const body = await parseBody(req, z.union([WorkspaceBenchmarkSchema, BenchmarkSchema]));
    if ("error" in body) return body.error;
    const d = body.data;
    const input: BenchmarkInput =
      "fromWorkspace" in d
        ? {
            name: d.name || `${cp.state.project.name} (workspace data)`,
            objective: d.objective,
            documents: cp.state.documents.map((x) => ({ title: x.metadata.title, content: x.content, path: x.externalId })),
            questions: cp.state.questions.map((q) => ({ question: q.question, requiredEvidence: q.requiredEvidence, questionClass: q.questionClass, split: q.split })),
          }
        : d;
    return NextResponse.json(startBenchmark(cp, input), { status: 202 });
  });
}
