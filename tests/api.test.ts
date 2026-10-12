import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHEAP_BASELINE, cheapSpace, tempDir } from "./fixtures";

// Isolated workspace + sources root for the route handlers.
const dataDir = tempDir("radar-api-");
const sourcesDir = tempDir("radar-src-");
process.env.RADAR_DATA_DIR = dataDir;
process.env.RADAR_SOURCES_ROOT = sourcesDir;
delete process.env.RADAR_API_KEY;
delete process.env.RADAR_ALLOW_REMOTE;

const { control } = await import("@/server/control");
const context = await import("@/app/api/v1/context/route");
const feedback = await import("@/app/api/v1/feedback/route");
const sources = await import("@/app/api/sources/route");
const sourceById = await import("@/app/api/sources/[id]/route");
const workspace = await import("@/app/api/workspace/route");

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("API", () => {
  beforeAll(async () => {
    await control(); // seeds the demo fixture into the temp workspace
  });
  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns 409 when no plan is deployed", async () => {
    const res = await context.POST(post("/api/v1/context", { query: "Who approved deploy DEP-1187?" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("no_deployed_plan");
  });

  it("rejects invalid requests", async () => {
    for (const body of [{}, { query: "" }, { query: "x".repeat(2001) }, { query: "ok", extra: 1 }, { query: "ok", constraints: { maxTokens: -5 } }]) {
      const res = await context.POST(post("/api/v1/context", body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const bad = await context.POST(new Request("http://localhost/api/v1/context", { method: "POST", body: "{not json" }));
    expect(bad.status).toBe(400);
  });

  it("serves context from the deployed plan with provenance, trace and metrics", async () => {
    const cp = await control();
    const run = cp.startRun({ objective: "balanced", constraints: {}, strategy: "exhaustive", space: cheapSpace(), calibrate: false, baselineConfig: CHEAP_BASELINE });
    await cp.waitForRun();
    expect(run.status).toBe("completed");
    cp.deploy(run.candidateReleaseId!);

    const res = await context.POST(post("/api/v1/context", { query: "Who approved deploy DEP-1187?" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.context.length).toBeGreaterThan(0);
    expect(json.plan.version).toBe(1);
    expect(json.router.class).toBe("lookup");
    for (const item of json.context) {
      expect(item.provenance.planId).toBe(json.plan.id);
      expect(item.provenance.documentId).toBeTruthy();
      expect(item.provenance.method).toBeTruthy();
    }
    expect(json.trace.steps.map((s: { step: string }) => s.step)).toEqual(expect.arrayContaining(["route", "select plan", "retrieve", "assemble"]));
    expect(json.metrics.measuredLatencyMs).toBeGreaterThan(0);
    expect(json.notice).toMatch(/untrusted/i);

    const log = cp.store.recentRequests(1)[0];
    expect(log.id).toBe(json.requestId);
    expect(log.planVersion).toBe(1);
    expect(JSON.stringify(log)).not.toContain(json.context[0].text.slice(0, 40)); // no document content in traces

    const fb = await feedback.POST(post("/api/v1/feedback", { requestId: json.requestId, useful: false, missingEvidence: "approver" }));
    expect(fb.status).toBe(201);
  });

  it("enforces the token constraint", async () => {
    const res = await context.POST(post("/api/v1/context", { query: "How do I roll back a service deployment?", constraints: { maxTokens: 60 } }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.metrics.contextTokens).toBeLessThanOrEqual(60);
  });

  it("falls back to the fallback plan for a class without a plan", async () => {
    const cp = await control();
    const original = cp.router;
    Object.defineProperty(cp, "router", { value: { ...original, route: () => ({ class: "billing", confidence: 0.9, signals: ["test"] }) }, configurable: true });
    try {
      const json = await (await context.POST(post("/api/v1/context", { query: "anything at all" }))).json();
      expect(json.plan.fallbackUsed).toBe(true);
      expect(json.plan.questionClass).toBe("*");
    } finally {
      Object.defineProperty(cp, "router", { value: original, configurable: true });
    }
  });

  it("blocks non-local control-plane requests and enforces the API key", async () => {
    const remote = await workspace.GET(new Request("http://evil.example/api/workspace"));
    expect(remote.status).toBe(403);
    process.env.RADAR_API_KEY = "secret-key";
    try {
      expect((await context.POST(post("/api/v1/context", { query: "hi there" }))).status).toBe(401);
      const ok = await context.POST(post("/api/v1/context", { query: "hi there" }, { authorization: "Bearer secret-key" }));
      expect(ok.status).toBe(200);
    } finally {
      delete process.env.RADAR_API_KEY;
    }
  });

  it("connects a local folder, rejects path traversal, and survives a source failure", async () => {
    fs.mkdirSync(path.join(sourcesDir, "notes"));
    fs.writeFileSync(path.join(sourcesDir, "notes", "a.md"), "# Note A\n\nThe build cache lives in S3 bucket radar-cache.");
    fs.writeFileSync(path.join(sourcesDir, "notes", "skip.exe"), "binary");

    for (const p of ["../", "..\\..\\Windows", "/etc", "C:\\Windows", "notes/../../x"]) {
      const res = await sources.POST(post("/api/sources", { type: "filesystem", path: p }));
      expect(res.status, p).toBe(400);
    }

    const res = await sources.POST(post("/api/sources", { type: "filesystem", name: "Notes", path: "notes" }));
    expect(res.status).toBe(201);
    const src = await res.json();
    expect(src.documentCount).toBe(1);
    expect(src.synthetic).toBe(false);

    fs.rmSync(path.join(sourcesDir, "notes"), { recursive: true });
    const sync = await sourceById.POST(post(`/api/sources/${src.id}`, {}), { params: Promise.resolve({ id: src.id }) });
    expect(sync.status).toBe(200);
    const after = await sync.json();
    expect(after.syncStatus).toBe("error");
    expect(after.syncError).toBeTruthy();
  });
});
