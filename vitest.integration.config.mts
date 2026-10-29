import { defineConfig } from "vitest/config";

// Pruebas de integración contra el Supabase local (npm run db:up). Los archivos se ejecutan
// uno tras otro porque comparten la misma base.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
