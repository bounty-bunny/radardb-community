/**
 * RadarDB local CLI (no account, no network service, no telemetry).
 *   npm run radar -- <command> [options]
 *
 *   doctor                         check the local installation (read-only)
 *   context <query…> [--max-tokens N] [--json]
 *                                  run the deployed ContextPlan for a query (same code path as POST /api/v1/context)
 *   plan export [--release ID] [--out FILE]
 *                                  write a portable radardb.plan-release v1 document
 *   plan validate <FILE>           validate a plan-release document (and migrate the legacy /api/plans shape)
 *   manifest [--out FILE]          print the reproducible experiment manifest of the workspace
 *
 * Existing commands: `npm run optimize -- [objective] [--deploy]`, `npm run benchmark -- <folder> <questions.json>`.
 * Workspace directory: RADAR_DATA_DIR (default ./.radar).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface IO {
  out: (s: string) => void;
  err: (s: string) => void;
}
const defaultIO: IO = { out: (s) => console.log(s), err: (s) => console.error(s) };

const HELP = `RadarDB CLI

Usage: npm run radar -- <command> [options]

Commands:
  doctor                               Check the local installation (read-only)
  context <query...> [--max-tokens N] [--json]
                                       Run the deployed ContextPlan for a query
  plan export [--release ID] [--out FILE]
                                       Export a portable plan release (radardb.plan-release v1)
  plan validate <FILE>                 Validate a plan-release document
  manifest [--out FILE]                Print the workspace's experiment manifest
  help                                 Show this help

Also: npm run optimize -- [balanced|quality|cost|latency] [--deploy]
      npm run benchmark -- <folder-under-sources> <questions.json> [name]
Workspace: RADAR_DATA_DIR (default ./.radar)`;

/** Split argv into positionals and --flags (a flag takes the next value unless it is boolean). */
export function parseArgs(argv: string[], booleans: string[] = []): { pos: string[]; flags: Record<string, string | true> } {
  const pos: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (booleans.includes(k) || i + 1 >= argv.length || argv[i + 1].startsWith("--")) flags[k] = true;
      else flags[k] = argv[++i];
    } else pos.push(a);
  }
  return { pos, flags };
}

function workspaceDir() {
  return path.resolve(process.env.RADAR_DATA_DIR ?? path.join(process.cwd(), ".radar"));
}

async function doctor(io: IO): Promise<number> {
  let failures = 0;
  const check = (ok: boolean, label: string, detail: string) => {
    io.out(`${ok ? "ok  " : "FAIL"}  ${label}: ${detail}`);
    if (!ok) failures++;
  };
  const info = (label: string, detail: string) => io.out(`info  ${label}: ${detail}`);
  const [major, minor] = process.versions.node.split(".").map(Number);
  check(major > 20 || (major === 20 && minor >= 9), "Node.js", `${process.version} (requires >= 20.9)`);
  const dir = workspaceDir();
  const stateFile = path.join(dir, "state.json");
  if (fs.existsSync(stateFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(stateFile, "utf8")) as { schemaVersion?: number; documents?: unknown[]; questions?: unknown[]; releases?: { status: string }[] };
      const deployed = (s.releases ?? []).filter((r) => r.status === "deployed").length;
      check(true, "Workspace", `${dir} (schema v${s.schemaVersion ?? "?"}, ${s.documents?.length ?? 0} documents, ${s.questions?.length ?? 0} questions, ${deployed ? "a release is deployed" : "no deployed release"})`);
    } catch (e) {
      check(false, "Workspace", `${stateFile} is unreadable: ${(e as Error).message}`);
    }
  } else info("Workspace", `${dir} does not exist yet; it is created with the demo dataset on first use`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    check(true, "Workspace writable", dir);
  } catch {
    check(false, "Workspace writable", dir);
  }
  const modelDir = path.join(process.cwd(), "node_modules", "@huggingface", "transformers", ".cache", "Xenova");
  for (const m of ["all-MiniLM-L6-v2", "ms-marco-MiniLM-L-6-v2"])
    if (fs.existsSync(path.join(modelDir, m))) check(true, `Model ${m}`, "cached locally");
    else info(`Model ${m}`, "not cached yet; downloaded once from the Hugging Face Hub on first use (network required that one time)");
  info("Telemetry", "none — RadarDB sends no usage data anywhere");
  info("API key", process.env.RADAR_API_KEY ? "RADAR_API_KEY is set: the data plane requires a bearer token" : "RADAR_API_KEY not set: the data plane accepts localhost requests only");
  io.out(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  return failures ? 1 : 0;
}

async function context(args: string[], io: IO): Promise<number> {
  const { pos, flags } = parseArgs(args, ["json"]);
  const query = pos.join(" ").trim();
  if (!query) {
    io.err("usage: npm run radar -- context <query...> [--max-tokens N] [--json]");
    return 2;
  }
  const maxTokens = flags["max-tokens"] !== undefined ? Number(flags["max-tokens"]) : undefined;
  if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens <= 0)) {
    io.err("--max-tokens must be a positive integer");
    return 2;
  }
  const { control } = await import("@/server/control");
  const { serveContext } = await import("@/server/dataplane");
  const res = await serveContext(await control(), { query, constraints: maxTokens ? { maxTokens } : {} }, { log: false });
  if (flags.json) {
    io.out(JSON.stringify(res, null, 2));
    return 0;
  }
  io.out(`plan ${res.plan.id} v${res.plan.version} (class ${res.plan.questionClass}${res.plan.fallbackUsed ? ", fallback" : ""})`);
  for (const c of res.context) io.out(`\n#${c.provenance.rank} ${c.provenance.documentTitle} (${c.tokens} tokens)\n${c.text}`);
  return 0;
}

async function plan(args: string[], io: IO): Promise<number> {
  const [sub, ...rest] = args;
  const { pos, flags } = parseArgs(rest);
  if (sub === "export") {
    const { control } = await import("@/server/control");
    const { toPortableRelease } = await import("@/core/portable");
    const cp = await control();
    const releases = [...cp.state.releases].sort((a, b) => b.version - a.version);
    const id = typeof flags.release === "string" ? flags.release : null;
    const release = id ? releases.find((r) => r.id === id) : (cp.deployedRelease() ?? releases[0]);
    if (!release) {
      io.err(id ? `release ${id} not found` : "no plan release exists yet; run `npm run optimize` first");
      return 1;
    }
    const json = JSON.stringify(toPortableRelease(release, cp.plansOf(release), new Date().toISOString()), null, 2);
    if (typeof flags.out === "string") {
      fs.writeFileSync(flags.out, json + "\n");
      io.out(`wrote ${flags.out} (release v${release.version})`);
    } else io.out(json);
    return 0;
  }
  if (sub === "validate") {
    const file = pos[0];
    if (!file) {
      io.err("usage: npm run radar -- plan validate <FILE>");
      return 2;
    }
    let input: unknown;
    try {
      input = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      io.err(`cannot read ${file}: ${(e as Error).message}`);
      return 1;
    }
    const { parsePortableRelease } = await import("@/core/portable");
    const r = parsePortableRelease(input);
    if (!r.ok) {
      io.err(`invalid plan release:\n${r.errors.map((e) => `  - ${e}`).join("\n")}`);
      return 1;
    }
    io.out(`valid radardb.plan-release v${r.release.schemaVersion}: release v${r.release.release.version}, ${r.release.plans.length} plan(s)${r.migratedFrom ? ` (migrated from ${r.migratedFrom})` : ""}`);
    return 0;
  }
  io.err("usage: npm run radar -- plan <export|validate> ...");
  return 2;
}

async function manifest(args: string[], io: IO): Promise<number> {
  const { flags } = parseArgs(args);
  const { control } = await import("@/server/control");
  const { createExperimentManifest } = await import("@/engine/manifest");
  const { enumerateSpace } = await import("@/engine/optimizer/space");
  const cp = await control();
  const m = createExperimentManifest({
    datasetVersion: cp.datasetVersion(),
    documents: cp.state.documents,
    questions: cp.state.questions,
    space: enumerateSpace(),
    router: { version: cp.router.version, fallbackThreshold: cp.router.fallbackThreshold },
  });
  const json = JSON.stringify(m, null, 2);
  if (typeof flags.out === "string") {
    fs.writeFileSync(flags.out, json + "\n");
    io.out(`wrote ${flags.out}`);
  } else io.out(json);
  return 0;
}

export async function run(argv: string[], io: IO = defaultIO): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      io.out(HELP);
      return 0;
    case "doctor":
      return doctor(io);
    case "context":
      return context(rest, io);
    case "plan":
      return plan(rest, io);
    case "manifest":
      return manifest(rest, io);
    default:
      io.err(`unknown command: ${cmd}\n\n${HELP}`);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    },
  );
}
