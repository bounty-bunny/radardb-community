import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "oss/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Tests share process-wide caches (models, representations); run files serially.
    fileParallelism: false,
  },
});
