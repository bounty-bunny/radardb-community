import type { ControlPlane } from "./control";

export interface DriftSignal {
  id: "data-changed" | "router-changed" | "workload-shift" | "negative-feedback" | "latency";
  label: string;
  status: "ok" | "warn" | "insufficient-data" | "not-applicable";
  detail: string;
}

export interface DriftReport {
  releaseVersion: number | null;
  signals: DriftSignal[];
  recommendation: string;
}

const MIN_REQUESTS = 30;
const MIN_FEEDBACK = 10;

/**
 * Drift detection: signals only. Nothing here triggers optimization or
 * deployment. The intended pipeline (signal → optimizer run → candidate →
 * held-out/shadow validation → human approval → deploy) keeps a human in
 * the loop; today a person reads these signals and re-runs the optimizer.
 */
export function computeDrift(cp: ControlPlane): DriftReport {
  const release = cp.deployedRelease();
  if (!release) return { releaseVersion: null, signals: [], recommendation: "No plan is deployed, so there is nothing to monitor yet." };
  const signals: DriftSignal[] = [];

  const current = cp.datasetVersion();
  signals.push({
    id: "data-changed",
    label: "Data changed since validation",
    status: current === release.datasetVersion ? "ok" : "warn",
    detail:
      current === release.datasetVersion
        ? `Serving the same dataset the plans were validated on (${current}).`
        : `Dataset is now ${current}; plans were validated on ${release.datasetVersion}.`,
  });

  signals.push({
    id: "router-changed",
    label: "Router version",
    status: cp.router.version === release.routerVersion ? "ok" : "warn",
    detail: `Router ${cp.router.version}; release validated with ${release.routerVersion}.`,
  });

  const requests = cp.store.recentRequests(500).filter((r) => r.releaseVersion === release.version);
  if (requests.length < MIN_REQUESTS) {
    signals.push({
      id: "workload-shift",
      label: "Question mix vs eval set",
      status: "insufficient-data",
      detail: `${requests.length} production requests on v${release.version}; needs ${MIN_REQUESTS}.`,
    });
  } else {
    const dist = (classes: string[]) => {
      const m = new Map<string, number>();
      for (const c of classes) m.set(c, (m.get(c) ?? 0) + 1 / classes.length);
      return m;
    };
    const prod = dist(requests.map((r) => r.detectedClass));
    const evals = dist(cp.state.questions.map((q) => cp.router.route(q.question).class));
    const keys = new Set([...prod.keys(), ...evals.keys()]);
    const tvd = [...keys].reduce((s, k) => s + Math.abs((prod.get(k) ?? 0) - (evals.get(k) ?? 0)), 0) / 2;
    signals.push({
      id: "workload-shift",
      label: "Question mix vs eval set",
      status: tvd > 0.25 ? "warn" : "ok",
      detail: `Total variation distance ${tvd.toFixed(2)} between production classes and the eval set (warn above 0.25).`,
    });
  }

  const ids = new Set(requests.map((r) => r.id));
  const fb = cp.state.feedback.filter((f) => ids.has(f.requestId));
  if (fb.length < MIN_FEEDBACK) {
    signals.push({ id: "negative-feedback", label: "User feedback", status: "insufficient-data", detail: `${fb.length} feedback events; needs ${MIN_FEEDBACK}.` });
  } else {
    const bad = fb.filter((f) => !f.useful).length / fb.length;
    signals.push({
      id: "negative-feedback",
      label: "User feedback",
      status: bad > 0.3 ? "warn" : "ok",
      detail: `${Math.round(bad * 100)}% of ${fb.length} feedback events marked not useful (warn above 30%).`,
    });
  }

  const validated = release.validation?.measuredLatency;
  if (!validated || requests.length < 20) {
    signals.push({ id: "latency", label: "Serving latency", status: "insufficient-data", detail: `${requests.length} requests; needs 20 and a validated latency baseline.` });
  } else {
    const s = requests.map((r) => r.measuredLatencyMs).sort((a, b) => a - b);
    const p95 = s[Math.floor(0.95 * (s.length - 1))];
    signals.push({
      id: "latency",
      label: "Serving latency",
      status: p95 > validated.p95 * 2 ? "warn" : "ok",
      detail: `Production p95 ${Math.round(p95)} ms vs validated p95 ${Math.round(validated.p95)} ms (warn above 2×).`,
    });
  }

  const warn = signals.some((s) => s.status === "warn");
  return {
    releaseVersion: release.version,
    signals,
    recommendation: warn
      ? "Re-run the optimizer, review the candidate release and its held-out results, then deploy explicitly."
      : "No action needed. RadarDB never re-optimizes or redeploys on its own.",
  };
}
