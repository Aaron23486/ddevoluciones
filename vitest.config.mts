import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Pruebas unitarias: lógica pura, sin red ni base de datos. La cobertura se mide sobre esos
// módulos; el acceso a datos y las reglas de la base se prueban con integración
// (tests/integration) y la interfaz con e2e.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "scripts/**/*.test.mts"],
    coverage: {
      provider: "v8",
      include: [
        "src/constants/**",
        "src/domain/**",
        "src/lib/cn.ts",
        "src/lib/dashboard-interaction.ts",
        "src/lib/notifications/**",
        "src/schemas/**",
        "src/services/evidence-storage.ts",
        "scripts/lib/demo-data.mts",
        "scripts/lib/passwords.mts",
      ],
      exclude: ["**/*.test.*"],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
      reporter: ["text", "text-summary"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
