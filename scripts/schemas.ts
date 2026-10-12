/**
 * Writes the JSON Schema files for RadarDB's public, versioned formats to schemas/.
 *   npm run schemas
 * Generated from the zod schemas in src/core/schemas.ts (the single source of truth).
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { FusionPlanConfigSchema, PlanConfigSchema, PortablePlanReleaseSchema } from "@/core/schemas";

const OUT = path.join(process.cwd(), "schemas");
fs.mkdirSync(OUT, { recursive: true });
const write = (name: string, schema: z.ZodType, title: string) => {
  const json = { $id: `urn:radardb:schema:${name}`, title, ...z.toJSONSchema(schema, { unrepresentable: "any" }) };
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote schemas/${name}.json`);
};
write("plan-config.v1", PlanConfigSchema, "RadarDB PlanConfig (single ContextPlan configuration)");
write("fusion-plan-config.v1", FusionPlanConfigSchema, "RadarDB FusionPlanConfig (EXPERIMENTAL)");
write("plan-release.v1", PortablePlanReleaseSchema, "RadarDB portable plan release");
