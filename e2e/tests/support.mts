import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import { demoEvidencePng } from "../../scripts/lib/demo-data.mts";

export const AUTH_DIR = resolve(import.meta.dirname, "../.auth");
export const dataFile = resolve(AUTH_DIR, "data.json");

// Cuentas con sesión guardada y una aparte para probar el cierre de sesión sin invalidarlas.
export const SESSION_ROLES = [
  "admin",
  "devoluciones",
  "pesado",
  "inventario",
  "transportes",
] as const;
export type SessionRole = (typeof SESSION_ROLES)[number];
export type AccountKey = SessionRole | "signout";
export type Credentials = { email: string; password: string; id: string };

export type E2EData = {
  run: string;
  accounts: Record<AccountKey, Credentials>;
};

export function storageFile(role: SessionRole): string {
  return resolve(AUTH_DIR, `${role}.json`);
}

export function e2eData(): E2EData {
  return JSON.parse(readFileSync(dataFile, "utf8")) as E2EData;
}

// Referencias de prueba con prefijo E2E- (demostración DEMO-, integración IT-).
let sequence = 0;
export function e2eRef(label: string): string {
  sequence += 1;
  return `E2E-${e2eData().run}-${label}-${sequence}`;
}

// Imagen de evidencia ficticia, como la que elegiría el usuario.
export const EVIDENCE = {
  name: "evidencia.png",
  mimeType: "image/png",
  buffer: demoEvidencePng([90, 110, 140], 64, 48),
};

export async function signInThroughForm(
  page: Page,
  { email, password }: { email: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel(/Contrase/).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Revisión automática de accesibilidad (WCAG 2.1 A y AA) de lo que está en pantalla.
export async function expectNoAccessibilityViolations(
  page: Page,
  label: string,
): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(summary, `${label}: violaciones de accesibilidad`).toEqual([]);
}
