import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ContextPlan,
  Document,
  EvalQuestion,
  Evidence,
  Objective,
  OptimizerRun,
  PlanConfig,
  PlanRelease,
  RunConstraints,
  Source,
  SourceKind,
} from "@/core/domain";
import { demoRouter, type QuestionRouter } from "@/engine/router";
import { datasetVersionOf, materialize } from "@/engine/representations";
import { embeddingsFor } from "@/engine/executor";
import { computeIntegrity } from "@/engine/integrity";
import { optimize, type ClassSelection } from "@/engine/optimizer/runner";
import { validatePlans } from "@/engine/optimizer/validate";
import { strategyFor } from "@/engine/optimizer/strategies";
import { BASELINE_CONFIG, enumerateSpace } from "@/engine/optimizer/space";
import { hashUnit, sha1 } from "@/engine/text";
import { getStore, emptyState, freezePlan, type Store } from "./store";
import { FixtureConnector, parseFrontmatter } from "./connectors/fixture";
import { FilesystemConnector } from "./connectors/filesystem";
import type { ConnectorDocument, SourceConnector } from "./connectors/types";

export const FIXTURE_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "demo");
export const FIXTURE_SOURCES: { kind: SourceKind; name: string }[] = [
  { kind: "confluence", name: "Confluence" },
  { kind: "pagerduty", name: "PagerDuty" },
  { kind: "deployctl", name: "Deploy log" },
  { kind: "github", name: "GitHub" },
  { kind: "jira", name: "Jira" },
  { kind: "slack", name: "Slack" },
];

export function sourcesRoot(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.RADAR_SOURCES_ROOT ?? path.join(/* turbopackIgnore: true */ process.cwd(), "sources"));
}

export const MAX_UPLOAD_CHARS = 1_000_000;
const now = () => new Date().toISOString();

export class ControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Held-out assignment: decided once from the id, persisted, never recomputed. ~25% held out. */
export function assignSplit(id: string): "optimization" | "validation" {
  return hashUnit(`split:${id}`) < 0.25 ? "validation" : "optimization";
}

export class ControlPlane {
  readonly router: QuestionRouter = demoRouter;
  private running: Promise<void> | null = null;

  constructor(readonly store: Store) {}

  get state() {
    return this.store.state;
  }

  // ---------- sources ----------

  connectorFor(source: Source): SourceConnector {
    if (source.type === "fixture") return new FixtureConnector(FIXTURE_DIR, source.kind);
    if (source.type === "filesystem") return new FilesystemConnector(sourcesRoot(), source.connection.path, source.kind);
    throw new ControlError("not_syncable", "upload sources have no remote to sync from");
  }

  private toDocument(sourceId: string, cd: ConnectorDocument, existing?: Document): Document {
    const checksum = sha1(cd.content);
    if (existing && existing.checksum === checksum) return existing;
    return {
      id: `${sourceId}:${cd.externalId}`,
      sourceId,
      externalId: cd.externalId,
      content: cd.content,
      metadata: { ...(cd.metadata ?? {}), title: cd.title, kind: cd.kind },
      createdAt: existing?.createdAt ?? now(),
      updatedAt: cd.updatedAt,
      version: existing ? existing.version + 1 : 1,
      checksum,
    };
  }

  async syncSource(id: string, full = false): Promise<Source> {
    const source = this.state.sources.find((s) => s.id === id);
    if (!source) throw new ControlError("not_found", "source not found", 404);
    const connector = this.connectorFor(source);
    source.syncStatus = "syncing";
    try {
      const mine = this.state.documents.filter((d) => d.sourceId === id);
      const known = new Map(mine.map((d) => [d.externalId, d.checksum]));
      const changes = full ? { upserts: await connector.sync(), deletes: [] as string[] } : await connector.incrementalSync(known);
      const byExt = new Map(mine.map((d) => [d.externalId, d]));
      for (const cd of changes.upserts) {
        const doc = this.toDocument(id, cd, byExt.get(cd.externalId));
        this.state.documents = [...this.state.documents.filter((d) => d.id !== doc.id), doc];
      }
      const deletes = new Set(changes.deletes.map((e) => `${id}:${e}`));
      this.state.documents = this.state.documents.filter((d) => !deletes.has(d.id));
      source.syncStatus = "synced";
      source.syncError = undefined;
      source.lastSyncedAt = now();
    } catch (e) {
      source.syncStatus = "error";
      source.syncError = (e as Error).message;
    }
    source.documentCount = this.state.documents.filter((d) => d.sourceId === id).length;
    this.store.save();
    return source;
  }

  async addFilesystemSource(name: string, relPath: string): Promise<Source> {
    const connector = new FilesystemConnector(sourcesRoot(), relPath);
    const v = await connector.validate();
    if (!v.ok) throw new ControlError("invalid_source", v.error ?? "invalid path");
    const source: Source = {
      id: `src_fs_${randomUUID().slice(0, 8)}`,
      type: "filesystem",
      name: name.trim() || relPath,
      kind: "markdown",
      connection: { path: relPath.replace(/\\/g, "/") },
      syncStatus: "never",
      documentCount: 0,
      synthetic: false,
      permissions: { model: "none", note: "Filesystem permissions are not propagated yet." },
      createdAt: now(),
    };
    const dup = this.state.sources.find((s) => s.type === "filesystem" && s.connection.path === source.connection.path);
    if (dup) throw new ControlError("duplicate_source", `already connected as "${dup.name}"`);
    this.state.sources.push(source);
    return this.syncSource(source.id, true);
  }

  addUpload(title: string, content: string): Document {
    if (content.length > MAX_UPLOAD_CHARS) throw new ControlError("too_large", `documents are limited to ${MAX_UPLOAD_CHARS} characters`);
    let src = this.state.sources.find((s) => s.type === "upload");
    if (!src) {
      src = {
        id: "src_uploads",
        type: "upload",
        name: "Uploads",
        kind: "upload",
        connection: {},
        syncStatus: "synced",
        documentCount: 0,
        synthetic: false,
        permissions: { model: "none", note: "Uploaded documents are visible to every caller." },
        createdAt: now(),
      };
      this.state.sources.push(src);
    }
    const doc = this.toDocument(src.id, {
      externalId: randomUUID(),
      title: title.trim().slice(0, 200) || "Untitled",
      content: content.replace(/\r\n/g, "\n").trim(),
      kind: "upload",
      updatedAt: now(),
    });
    this.state.documents.push(doc);
    src.documentCount++;
    src.lastSyncedAt = now();
    this.store.save();
    return doc;
  }

  removeDocument(id: string) {
    const doc = this.state.documents.find((d) => d.id === id);
    if (!doc) throw new ControlError("not_found", "document not found", 404);
    const src = this.state.sources.find((s) => s.id === doc.sourceId);
    if (src?.type !== "upload") throw new ControlError("read_only", "only uploaded documents can be deleted; remove or re-sync the source instead");
    this.state.documents = this.state.documents.filter((d) => d.id !== id);
    src.documentCount--;
    this.store.save();
  }

  removeSource(id: string) {
    const src = this.state.sources.find((s) => s.id === id);
    if (!src) throw new ControlError("not_found", "source not found", 404);
    if (src.type === "fixture") throw new ControlError("read_only", "fixture sources are part of the demo; use Reset demo instead");
    this.state.sources = this.state.sources.filter((s) => s.id !== id);
    this.state.documents = this.state.documents.filter((d) => d.sourceId !== id);
    this.store.save();
  }

  datasetVersion(): string {
    return datasetVersionOf(this.state.documents);
  }

  // ---------- eval set ----------

  addQuestion(input: { question: string; requiredEvidence: Evidence[]; questionClass?: string }): EvalQuestion {
    const n = this.state.questions.reduce((m, q) => Math.max(m, parseInt(q.id.replace(/\D/g, "")) || 0), 0) + 1;
    const id = `q${String(n).padStart(2, "0")}`;
    const known = this.router.classes.map((c) => c.id);
    const q: EvalQuestion = {
      id,
      question: input.question.trim(),
      questionClass: input.questionClass && known.includes(input.questionClass) ? input.questionClass : this.router.route(input.question).class,
      requiredEvidence: input.requiredEvidence,
      split: assignSplit(id),
      provenance: "manual",
      humanVerified: true,
      createdAt: now(),
    };
    this.state.questions.push(q);
    this.store.save();
    return q;
  }

  removeQuestion(id: string) {
    if (!this.state.questions.some((q) => q.id === id)) throw new ControlError("not_found", "question not found", 404);
    this.state.questions = this.state.questions.filter((q) => q.id !== id);
    this.store.save();
  }

  integrity() {
    return computeIntegrity(this.state.questions, this.state.documents, this.state.sources);
  }

  // ---------- optimizer ----------

  activeRun(): OptimizerRun | undefined {
    return this.state.runs.find((r) => r.status === "running");
  }

  startRun(opts: {
    objective: Objective;
    constraints: RunConstraints;
    strategy: "exhaustive" | "random";
    samples?: number;
    /** Internal (tests/CLI): restrict the search space; skip latency calibration. */
    space?: PlanConfig[];
    calibrate?: boolean;
    baselineConfig?: PlanConfig;
  }): OptimizerRun {
    const active = this.activeRun();
    if (active) return active;
    if (!this.state.documents.length) throw new ControlError("no_documents", "connect a source before optimizing");
    const strategy = strategyFor(opts.strategy, { samples: opts.samples });
    const space = opts.space ?? enumerateSpace();
    const run: OptimizerRun = {
      id: `run_${Date.now().toString(36)}`,
      datasetVersion: this.datasetVersion(),
      routerVersion: this.router.version,
      strategy: { name: strategy.name, params: strategy.params },
      objective: opts.objective,
      constraints: opts.constraints,
      status: "running",
      startedAt: now(),
      progress: { stage: "Queued", done: 0, total: 1 },
      searchSpaceSize: space.length,
      configurationsTested: 0,
      distinctBehaviors: 0,
      optimizationSet: [],
      validationSet: [],
      corpus: { documents: this.state.documents.length, chunks: {} },
      baselineConfig: opts.baselineConfig ?? BASELINE_CONFIG,
      trials: [],
    };
    this.state.runs.unshift(run);
    this.state.runs = this.state.runs.slice(0, 10);
    this.running = this.executeRun(run, strategy, space, opts.calibrate !== false)
      .then(() => {
        run.status = "completed";
      })
      .catch((e: unknown) => {
        run.status = "failed";
        run.error = e instanceof Error ? e.message : String(e);
        console.error("[radar] optimizer run failed", e);
      })
      .finally(() => {
        run.completedAt = now();
        this.running = null;
        this.store.save();
      });
    return run;
  }

  /** Resolves when the active run (if any) finishes. Used by the CLI and tests. */
  async waitForRun() {
    await this.running;
  }

  private async executeRun(run: OptimizerRun, strategy: ReturnType<typeof strategyFor>, space: PlanConfig[], calibrate: boolean) {
    // Snapshot: edits during the run don't change what this run measures.
    const documents = this.state.documents.slice();
    const questions: EvalQuestion[] = JSON.parse(JSON.stringify(this.state.questions));
    const dataset = { version: datasetVersionOf(documents), documents };
    run.datasetVersion = dataset.version;
    run.progress = { stage: "Integrity checks", done: 0, total: 1 };
    run.integrity = computeIntegrity(questions, documents, this.state.sources);

    const scorable = questions.filter((q) => q.requiredEvidence.length > 0);
    const optSet = scorable.filter((q) => q.split === "optimization");
    const valSet = scorable.filter((q) => q.split === "validation");
    run.optimizationSet = optSet.map((q) => q.id);
    run.validationSet = valSet.map((q) => q.id);

    const out = await optimize(
      {
        runId: run.id,
        dataset,
        questions: optSet,
        router: this.router,
        strategy,
        objective: run.objective,
        constraints: run.constraints,
        baselineConfig: run.baselineConfig,
        space,
        calibrate,
      },
      {
        progress: (stage, done, total) => (run.progress = { stage, done, total }),
        trials: (t) => (run.trials = t),
        experiments: (rows) => this.store.appendExperiments(run.id, rows),
      },
    );
    run.trials = out.trials;
    run.configurationsTested = out.configurationsTested;
    run.distinctBehaviors = out.distinctBehaviors;
    run.corpus = { documents: documents.length, chunks: out.chunks };
    run.calibration = out.calibration;
    run.baseline = { optimization: out.baseline };

    // Candidate release: one immutable plan per learned class plus a fallback.
    const version = this.state.releases.reduce((m, r) => Math.max(m, r.version), 0) + 1;
    const mkPlan = (sel: ClassSelection): ContextPlan => ({
      id: `plan_v${version}_${sel.questionClass === "*" ? "fallback" : sel.questionClass}`,
      version,
      questionClass: sel.questionClass,
      config: sel.config,
      filters: {},
      metrics: sel.metrics,
      validationMetrics: null,
      confidence: { level: "low", reason: "not validated yet" },
      status: "candidate",
      runId: run.id,
      explanation: sel.explanation,
      createdAt: now(),
    });
    const plans = [...out.classes.map(mkPlan), mkPlan(out.fallback)];
    const release: PlanRelease = {
      id: `rel_v${version}`,
      version,
      runId: run.id,
      datasetVersion: dataset.version,
      routerVersion: this.router.version,
      planIds: Object.fromEntries(plans.filter((p) => p.questionClass !== "*").map((p) => [p.questionClass, p.id])),
      fallbackPlanId: plans.find((p) => p.questionClass === "*")!.id,
      status: "candidate",
      createdAt: now(),
      optimization: { questions: optSet.length, metrics: out.routed, baseline: out.baseline },
      validation: null,
    };
    run.candidateReleaseId = release.id;

    // Held-out validation, strictly after selection.
    run.progress = { stage: "Validating on held-out questions", done: 0, total: 1 };
    if (valSet.length) {
      const v = await validatePlans({
        dataset,
        questions: valSet,
        router: this.router,
        plans: Object.fromEntries(out.classes.map((c) => [c.questionClass, c.config])),
        fallback: out.fallback.config,
        baselineConfig: run.baselineConfig,
        calibration: out.calibration,
      });
      release.validation = {
        questions: valSet.length,
        metrics: v.metrics,
        baseline: v.baseline,
        measuredLatency: v.measuredLatency,
        baselineMeasuredLatency: v.baselineMeasuredLatency,
        perClass: v.perClass,
      };
      run.validationResults = v.perQuestion.map((q) => ({
        questionId: q.questionId,
        planClass: q.planClass,
        plan: { recall: q.plan.recall, success: q.plan.success, tokens: q.plan.tokens },
        baseline: { recall: q.baseline.recall, success: q.baseline.success, tokens: q.baseline.tokens },
      }));
      for (const p of plans) {
        p.validationMetrics = v.perClass[p.questionClass]?.metrics ?? null;
        p.confidence = confidenceOf(p);
      }
      release.status = "validated";
      release.validatedAt = now();
      for (const p of plans) p.status = "validated";
    } else {
      for (const p of plans) p.confidence = { level: "low", reason: "no held-out questions exist, so this plan is unvalidated" };
    }
    plans.forEach(freezePlan);
    this.state.plans.push(...plans);
    this.state.releases.push(release);
    run.progress = { stage: "Done", done: 1, total: 1 };
  }

  // ---------- plans ----------

  deployedRelease(): PlanRelease | undefined {
    return this.state.releases.find((r) => r.status === "deployed");
  }

  plansOf(release: PlanRelease): ContextPlan[] {
    const ids = new Set([...Object.values(release.planIds), release.fallbackPlanId]);
    return this.state.plans.filter((p) => ids.has(p.id));
  }

  /** Explicit, human-initiated deployment of a validated (or previously deployed) release. */
  deploy(releaseId: string): PlanRelease {
    const release = this.state.releases.find((r) => r.id === releaseId);
    if (!release) throw new ControlError("not_found", "release not found", 404);
    if (release.status === "deployed") return release;
    const redeploy = release.status === "retired" && !!release.deployedAt;
    if (release.status !== "validated" && !redeploy)
      throw new ControlError("not_validated", `release v${release.version} is ${release.status}; only validated releases can be deployed`);
    const current = this.deployedRelease();
    if (current) {
      current.status = "retired";
      current.retiredAt = now();
      for (const p of this.plansOf(current)) p.status = "retired";
    }
    release.status = "deployed";
    release.deployedAt = now();
    release.retiredAt = undefined;
    for (const p of this.plansOf(release)) {
      p.status = "deployed";
      p.deployedAt = release.deployedAt;
    }
    this.store.save();
    void this.warm(release);
    return release;
  }

  /** Redeploy the most recently retired release that was previously in production. */
  rollback(): PlanRelease {
    const current = this.deployedRelease();
    const previous = this.state.releases
      .filter((r) => r.status === "retired" && r.deployedAt && r.id !== current?.id)
      .sort((a, b) => (b.retiredAt ?? "").localeCompare(a.retiredAt ?? ""))[0];
    if (!previous) throw new ControlError("no_previous", "no previously deployed release to roll back to");
    return this.deploy(previous.id);
  }

  /** Build representations for a release ahead of traffic so the data plane never builds them on a request. */
  async warm(release: PlanRelease) {
    const version = this.datasetVersion();
    for (const p of this.plansOf(release))
      await materialize(this.state.documents, version, p.config.chunkingStrategy, embeddingsFor(p.config)).catch(() => {});
  }

  async resetDemo() {
    if (this.activeRun()) throw new ControlError("busy", "an optimization run is in progress", 409);
    this.store.clearLogs();
    this.store.reset(emptyState());
    await seedDemo(this);
  }
}

function confidenceOf(p: ContextPlan): ContextPlan["confidence"] {
  const nOpt = p.metrics.n;
  const v = p.validationMetrics;
  if (!v || !v.n) return { level: "low", reason: `no held-out questions were routed to this plan (${nOpt} optimization questions)` };
  const gap = p.metrics.retrievalSuccess - v.retrievalSuccess;
  const held = `${v.n} held-out question${v.n === 1 ? "" : "s"}`;
  if (nOpt >= 8 && v.n >= 3 && gap <= 0.15) return { level: "high", reason: `${nOpt} optimization questions; held-out result consistent on ${held}` };
  if (nOpt >= 4 && gap <= 0.25) return { level: "medium", reason: `${nOpt} optimization questions; ${held} — small sample` };
  return { level: "low", reason: gap > 0.25 ? `held-out success is ${Math.round(gap * 100)} pts below optimization (${held})` : `only ${nOpt} optimization questions` };
}

export async function seedDemo(cp: ControlPlane) {
  const s = cp.state;
  for (const f of FIXTURE_SOURCES)
    s.sources.push({
      id: `src_fixture_${f.kind}`,
      type: "fixture",
      name: f.name,
      kind: f.kind,
      connection: { fixture: `data/demo (${f.kind})` },
      syncStatus: "never",
      documentCount: 0,
      synthetic: true,
      permissions: { model: "none", note: "Synthetic fixture: no permissions model." },
      createdAt: now(),
    });
  for (const src of s.sources) await cp.syncSource(src.id, true);
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "evals.json"), "utf8")) as Omit<EvalQuestion, "provenance" | "humanVerified" | "createdAt">[];
  s.questions = raw.map((q) => ({ ...q, provenance: "fixture", humanVerified: false, createdAt: now() }));
  cp.store.save();
}

/** Control plane for the configured data directory; seeds the demo fixture on first use. */
export async function control(): Promise<ControlPlane> {
  const g = globalThis as unknown as { __radarControl?: Map<string, Promise<ControlPlane>> };
  g.__radarControl ??= new Map();
  const store = getStore();
  let p = g.__radarControl.get(store.dir);
  if (!p) {
    p = (async () => {
      const cp = new ControlPlane(store);
      if (!cp.state.sources.length && !cp.state.questions.length) await seedDemo(cp);
      const dep = cp.deployedRelease();
      if (dep) void cp.warm(dep);
      return cp;
    })();
    g.__radarControl.set(store.dir, p);
  }
  return p;
}

export { parseFrontmatter };
