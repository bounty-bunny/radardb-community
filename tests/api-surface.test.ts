import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as engine from "@/engine";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The STABLE runtime surface of `@/engine`. Changing this list is an API change: update CHANGELOG.md. */
const STABLE_EXPORTS = [
  "BASELINE_CONFIG", "BM25", "CHUNKERS", "COST_MODEL", "ChunkingStrategySchema", "ContextAssembler", "CrossEncoderReranker", "DEFAULT_CALIBRATION",
  "DEMO_CLASSES", "ENGINE_VERSION", "EmbeddingModelSchema", "EntityGraph", "EntityGraphRetriever", "ExactMatchBooster", "ExhaustiveSearch",
  "FixedChunker", "FusionPlanConfigSchema", "GraphStrategySchema", "HybridRetriever", "LexicalRetriever", "NoReranker", "PLAN_RELEASE_SCHEMA",
  "PLAN_RELEASE_SCHEMA_VERSION", "PlanConfigSchema", "PortablePlanReleaseSchema", "RandomSearch", "RerankerNameSchema", "RetrievalStrategySchema",
  "RuleBasedRouter", "SEARCH_SPACE", "SectionChunker", "SentenceWindowChunker", "VectorRetriever", "aggregate", "computeIntegrity",
  "createExperimentManifest", "datasetVersionOf", "demoRouter", "denseSearch", "describePlan", "embed", "embeddingsFor", "enumerateSpace",
  "estTokens", "estimateCostUsd", "estimateLatencyMs", "evictRepresentations", "executePlan", "experimental", "extractEntities", "familyOf",
  "flushModelCaches", "latencyStats", "materialize", "normalize", "optimize", "paretoFront", "parsePortableRelease", "planKey", "prepareQuery",
  "questionSetHash", "rerankScores", "rerankerFor", "resolvePlanClass", "retrieverFor", "rrf", "scoreContext", "searchSpaceHash", "selectConfig",
  "shortPlan", "strategyFor", "toPortableRelease", "tokenize", "validatePlans", "warmModels", "wilson", "withinConstraints",
].sort();

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

describe("public engine API", () => {
  it("exports exactly the documented stable surface", () => {
    expect(Object.keys(engine).sort()).toEqual(STABLE_EXPORTS);
  });

  it("keeps experimental components in the experimental namespace", () => {
    expect(Object.keys(engine.experimental).sort()).toEqual(["fusion", "objective", "portfolio"]);
    expect(typeof engine.experimental.fusion.executeFusionPlan).toBe("function");
  });

  it("reports the package version", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };
    expect(engine.ENGINE_VERSION).toBe(pkg.version);
  });
});

describe("dependency boundaries", () => {
  it("core and engine never import the server, UI, Next.js, validation or research code", () => {
    const offenders: string[] = [];
    for (const f of [...filesUnder(path.join(ROOT, "src/core")), ...filesUnder(path.join(ROOT, "src/engine"))]) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1];
        if (/^@\/(server|app|components|lib)\b/.test(spec) || /^next(\/|$)/.test(spec) || /(validation|research)\//.test(spec)) offenders.push(`${path.relative(ROOT, f)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("application code never imports validation or research harnesses", () => {
    const offenders: string[] = [];
    for (const f of [...filesUnder(path.join(ROOT, "src")), ...filesUnder(path.join(ROOT, "scripts"))]) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) if (/(^|\/)(validation|research)\//.test(m[1])) offenders.push(`${path.relative(ROOT, f)} -> ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });
});
