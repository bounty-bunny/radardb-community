import type { ContextPlan, Document, OptimizerRun, PlanRelease } from "@/core/domain";
import type { ControlPlane } from "./control";

/** Run without the full trial list (for lists and polling). */
export function runSummary(run: OptimizerRun) {
  const { trials, ...rest } = run;
  return { ...rest, trialsDone: trials.length, paretoCount: trials.filter((t) => t.pareto).length };
}
export type RunSummary = ReturnType<typeof runSummary>;

export function docSummary(d: Document) {
  return {
    id: d.id,
    sourceId: d.sourceId,
    externalId: d.externalId,
    title: d.metadata.title,
    kind: d.metadata.kind,
    distractor: !!d.metadata.distractor,
    updatedAt: d.updatedAt,
    version: d.version,
    tokens: Math.ceil(d.content.length / 4),
  };
}
export type DocSummary = ReturnType<typeof docSummary>;

export interface ReleaseView {
  release: PlanRelease;
  plans: ContextPlan[];
}

export function releaseView(cp: ControlPlane, r: PlanRelease): ReleaseView {
  return { release: r, plans: cp.plansOf(r) };
}

export function workspaceView(cp: ControlPlane) {
  const s = cp.state;
  const deployed = cp.deployedRelease();
  const latest = [...s.releases].sort((a, b) => b.version - a.version)[0];
  const active = cp.activeRun();
  const lastRun = s.runs.find((r) => r.status !== "running");
  return {
    project: s.project,
    router: { version: cp.router.version, classes: cp.router.classes, fallbackThreshold: cp.router.fallbackThreshold },
    datasetVersion: cp.datasetVersion(),
    counts: {
      sources: s.sources.length,
      documents: s.documents.length,
      questions: s.questions.length,
      optimization: s.questions.filter((q) => q.split === "optimization").length,
      validation: s.questions.filter((q) => q.split === "validation").length,
    },
    sources: s.sources,
    deployed: deployed ? releaseView(cp, deployed) : null,
    latest: latest ? releaseView(cp, latest) : null,
    activeRun: active ? runSummary(active) : null,
    lastRun: lastRun ? runSummary(lastRun) : null,
    benchmarkRunning: s.benchmarks.some((b) => b.status === "running"),
  };
}
export type WorkspaceView = ReturnType<typeof workspaceView>;
