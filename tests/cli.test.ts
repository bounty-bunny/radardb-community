import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tempDir } from "./fixtures";

// Isolated workspace: the CLI must never touch the developer's real .radar/.
const dataDir = tempDir("radar-cli-");
const sourcesDir = tempDir("radar-cli-src-");
process.env.RADAR_DATA_DIR = dataDir;
process.env.RADAR_SOURCES_ROOT = sourcesDir;

const { run, parseArgs } = await import("../scripts/radar");
const { toPortableRelease } = await import("@/core/portable");
const { BASELINE_CONFIG } = await import("@/engine/optimizer/space");

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) }, out, err };
}

describe("radar CLI", () => {
  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(sourcesDir, { recursive: true, force: true });
  });

  it("parses positionals, valued flags and boolean flags", () => {
    expect(parseArgs(["who", "approved", "--max-tokens", "300", "--json"], ["json"])).toEqual({ pos: ["who", "approved"], flags: { "max-tokens": "300", json: true } });
  });

  it("prints help and rejects unknown commands", async () => {
    const a = capture();
    expect(await run(["help"], a.io)).toBe(0);
    expect(a.out.join("\n")).toMatch(/doctor/);
    const b = capture();
    expect(await run(["frobnicate"], b.io)).toBe(2);
    expect(b.err.join("\n")).toMatch(/unknown command/);
  });

  it("doctor is read-only on a fresh workspace and reports no telemetry", async () => {
    const c = capture();
    const code = await run(["doctor"], c.io);
    const text = c.out.join("\n");
    expect(code).toBe(0);
    expect(text).toMatch(/Telemetry: none/);
    expect(fs.existsSync(path.join(dataDir, "state.json"))).toBe(false);
  });

  it("validates plan-release files and reports readable errors", async () => {
    const release = { id: "rel_1", version: 1, runId: "run", datasetVersion: "dv", routerVersion: "rules-v1", planIds: {}, fallbackPlanId: "p", status: "deployed", createdAt: "2026-01-01T00:00:00Z" };
    const planObj = { id: "p", version: 1, questionClass: "*", config: BASELINE_CONFIG, filters: {}, metrics: null, validationMetrics: null, confidence: { level: "low", reason: "test" }, status: "deployed", runId: "run", explanation: {}, createdAt: "2026-01-01T00:00:00Z" };
    const good = path.join(dataDir, "good.json");
    fs.writeFileSync(good, JSON.stringify(toPortableRelease(release as never, [planObj as never], "2026-01-02T00:00:00Z")));
    const a = capture();
    expect(await run(["plan", "validate", good], a.io)).toBe(0);
    expect(a.out[0]).toMatch(/^valid radardb\.plan-release v1: release v1, 1 plan/);
    const bad = path.join(dataDir, "bad.json");
    fs.writeFileSync(bad, JSON.stringify({ schema: "radardb.plan-release", schemaVersion: 9 }));
    const b = capture();
    expect(await run(["plan", "validate", bad], b.io)).toBe(1);
    expect(b.err.join("\n")).toMatch(/unsupported version 9/);
    const c = capture();
    expect(await run(["plan", "validate"], c.io)).toBe(2);
  });

  it("rejects an invalid --max-tokens before touching the workspace", async () => {
    const c = capture();
    expect(await run(["context", "hello", "--max-tokens", "-3"], c.io)).toBe(2);
  });
});

describe("GET /api/plans/export", () => {
  let exportRoute: typeof import("@/app/api/plans/export/route");
  beforeAll(async () => {
    exportRoute = await import("@/app/api/plans/export/route");
  });

  it("is control-plane only (refuses non-local hosts)", async () => {
    const res = await exportRoute.GET(new Request("http://example.com/api/plans/export"));
    expect(res.status).toBe(403);
  });

  it("returns 404 with a typed error when no release exists", async () => {
    const res = await exportRoute.GET(new Request("http://localhost/api/plans/export"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("no_release");
  });
});
