import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { readLocalSupabase } from "../scripts/lib/supabase-local.mts";

// Pruebas e2e en el navegador: accesos por rol, flujo de devoluciones y reporte de carga,
// seguridad del navegador y accesibilidad. Compilan y levantan la app en modo producción en
// :3100 contra el Supabase local (`npm run db:up`), sin interferir con `npm run dev` (:3000).
// Cada ejecución crea sus propias cuentas con un prefijo único y las borra al terminar.
const repoRoot = resolve(import.meta.dirname, "..");
const PORT = 3100;
const supabase = readLocalSupabase();

export default defineConfig({
  testDir: "./tests",
  // Los escenarios comparten cuentas: uno a la vez.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "./playwright-report" }],
      ]
    : [["list"]],
  globalSetup: "./global-setup.mts",
  globalTeardown: "./global-teardown.mts",
  outputDir: "./test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-CR",
    timezoneId: "America/Costa_Rica",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Chromium de Playwright por defecto (`npx playwright install chromium`); con
  // E2E_BROWSER_CHANNEL=msedge o chrome se usa el navegador instalado en el equipo.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.E2E_BROWSER_CHANNEL ?? "chromium",
      },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    cwd: repoRoot,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    } as Record<string, string>,
  },
});
