/**
 * Portable plan releases: export a workspace's release to a versioned,
 * validated JSON document, and read one back (including the legacy shape
 * returned by GET /api/plans before the portable format existed).
 * Pure functions: no I/O, no workspace mutation.
 */
import type { ContextPlan, PlanRelease } from "./domain";
import { PLAN_RELEASE_SCHEMA, PLAN_RELEASE_SCHEMA_VERSION, PortablePlanReleaseSchema, type PortablePlanRelease } from "./schemas";

export const ENGINE_VERSION = "0.2.0";

export function toPortableRelease(release: PlanRelease, plans: ContextPlan[], exportedAt: string): PortablePlanRelease {
  const doc: PortablePlanRelease = {
    schema: PLAN_RELEASE_SCHEMA,
    schemaVersion: PLAN_RELEASE_SCHEMA_VERSION,
    exportedAt,
    engine: { name: "radardb", version: ENGINE_VERSION },
    release: { version: release.version, datasetVersion: release.datasetVersion, routerVersion: release.routerVersion, createdAt: release.createdAt },
    plans: plans
      .map((p) => ({ questionClass: p.questionClass, config: p.config, optimizationMetrics: p.metrics ?? null, validationMetrics: p.validationMetrics, confidence: p.confidence }))
      .sort((a, b) => (a.questionClass === "*" ? 1 : b.questionClass === "*" ? -1 : a.questionClass.localeCompare(b.questionClass))),
  };
  return PortablePlanReleaseSchema.parse(doc);
}

export type ParseResult = { ok: true; release: PortablePlanRelease; migratedFrom: string | null } | { ok: false; errors: string[] };

const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) => e.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);

/**
 * Validate a portable plan release. Accepts:
 *  - `radardb.plan-release` v1 (current);
 *  - the legacy `{ release, plans }` shape from GET /api/plans (migrated to v1).
 * Unknown schema versions are rejected rather than guessed.
 */
export function parsePortableRelease(input: unknown, now: () => string = () => new Date().toISOString()): ParseResult {
  if (input && typeof input === "object" && "schema" in input) {
    const v = (input as { schemaVersion?: unknown }).schemaVersion;
    if (v !== PLAN_RELEASE_SCHEMA_VERSION) return { ok: false, errors: [`schemaVersion: unsupported version ${JSON.stringify(v)} (this engine reads ${PLAN_RELEASE_SCHEMA_VERSION})`] };
    const r = PortablePlanReleaseSchema.safeParse(input);
    return r.success ? { ok: true, release: r.data, migratedFrom: null } : { ok: false, errors: issues(r.error) };
  }
  if (input && typeof input === "object" && "release" in input && "plans" in input) {
    const legacy = input as { release: PlanRelease; plans: ContextPlan[] };
    try {
      return { ok: true, release: toPortableRelease(legacy.release, legacy.plans, now()), migratedFrom: "legacy /api/plans release view" };
    } catch (e) {
      const z = e as { issues?: { path: PropertyKey[]; message: string }[] };
      return { ok: false, errors: z.issues ? issues({ issues: z.issues }) : [String(e)] };
    }
  }
  return { ok: false, errors: ["(root): not a RadarDB plan release (expected `schema: \"radardb.plan-release\"` or a legacy { release, plans } object)"] };
}
