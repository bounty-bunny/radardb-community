import fs from "node:fs";
import path from "node:path";
import type {
  Benchmark,
  ContextPlan,
  ContextRequest,
  Document,
  EvalQuestion,
  ExperimentResult,
  Feedback,
  OptimizerRun,
  PlanRelease,
  Source,
} from "@/core/domain";

export const SCHEMA_VERSION = 2;

export interface State {
  schemaVersion: number;
  project: { name: string; description: string };
  sources: Source[];
  documents: Document[];
  questions: EvalQuestion[];
  runs: OptimizerRun[];
  plans: ContextPlan[];
  releases: PlanRelease[];
  feedback: Feedback[];
  benchmarks: Benchmark[];
}

export function emptyState(): State {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: "acme-checkout", description: "Synthetic engineering knowledge for a fictional checkout platform (demo fixture)" },
    sources: [],
    documents: [],
    questions: [],
    runs: [],
    plans: [],
    releases: [],
    feedback: [],
    benchmarks: [],
  };
}

function writeAtomic(file: string, data: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** Deep-freeze plan configs and metrics so a deployed plan can't be mutated in place. */
function freezeDeep<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) freezeDeep(v);
  }
  return o;
}

export function freezePlan(p: ContextPlan) {
  freezeDeep(p.config);
  freezeDeep(p.metrics);
  freezeDeep(p.explanation);
  if (p.validationMetrics) freezeDeep(p.validationMetrics);
}

/**
 * Local persistence: one JSON state file (atomic replace), plus append-only
 * JSONL for request logs and experiment results. Single-process writer.
 */
export class Store {
  readonly dir: string;
  readonly state: State;
  private stateFile: string;

  constructor(dir: string) {
    this.dir = dir;
    this.stateFile = path.join(dir, "state.json");
    this.state = this.load();
  }

  private load(): State {
    let s: State;
    try {
      s = JSON.parse(fs.readFileSync(this.stateFile, "utf8")) as State;
    } catch {
      return emptyState();
    }
    if (s.schemaVersion !== SCHEMA_VERSION) {
      // MVP (v1) state used a different shape. Keep a copy and start fresh.
      try {
        fs.copyFileSync(this.stateFile, `${this.stateFile}.v${s.schemaVersion ?? 1}.bak`);
      } catch {}
      return emptyState();
    }
    // A run or benchmark that was running when the process stopped can't resume.
    for (const r of s.runs)
      if (r.status === "running") Object.assign(r, { status: "failed", error: "interrupted: server restarted during the run" });
    for (const b of s.benchmarks)
      if (b.status === "running") Object.assign(b, { status: "failed", error: "interrupted: server restarted during the benchmark" });
    s.plans.forEach(freezePlan);
    return s;
  }

  save() {
    writeAtomic(this.stateFile, JSON.stringify(this.state));
  }

  reset(next: State) {
    Object.assign(this.state, next);
    this.save();
  }

  // ----- append-only logs -----

  logRequest(r: ContextRequest) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(path.join(this.dir, "requests.jsonl"), JSON.stringify(r) + "\n");
  }

  recentRequests(limit = 100): ContextRequest[] {
    try {
      const lines = fs.readFileSync(path.join(this.dir, "requests.jsonl"), "utf8").trim().split("\n");
      return lines
        .slice(-limit)
        .reverse()
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as ContextRequest];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }

  appendExperiments(runId: string, rows: ExperimentResult[]) {
    const dir = path.join(this.dir, "experiments");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${runId}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }

  experimentsFile(runId: string) {
    return path.join(this.dir, "experiments", `${runId}.jsonl`);
  }

  benchmarkDir(id: string) {
    return path.join(this.dir, "benchmarks", id);
  }

  clearLogs() {
    for (const p of ["requests.jsonl", "experiments", "benchmarks"]) fs.rmSync(path.join(/* turbopackIgnore: true */ this.dir, p), { recursive: true, force: true });
  }
}

const stores = new Map<string, Store>();

export function dataDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.RADAR_DATA_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".radar"));
}

/** Process-wide store for the configured data directory (survives dev hot reloads via globalThis). */
export function getStore(dir = dataDir()): Store {
  const g = globalThis as unknown as { __radarStores?: Map<string, Store> };
  g.__radarStores ??= stores;
  let s = g.__radarStores.get(dir);
  if (!s) {
    s = new Store(dir);
    g.__radarStores.set(dir, s);
  }
  return s;
}
