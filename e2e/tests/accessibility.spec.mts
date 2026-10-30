import { expect, test } from "@playwright/test";

import { expectNoAccessibilityViolations, storageFile } from "./support.mts";

test.describe("accesibilidad sin sesión", () => {
  test("pantalla de ingreso", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
    await expectNoAccessibilityViolations(page, "/login");
  });

  test("ingreso con error", async ({ page }) => {
    await page.goto("/login?error=credentials");
    await expect(
      page.getByText("Correo o contrasena incorrectos."),
    ).toBeVisible();
    await expectNoAccessibilityViolations(page, "/login?error=credentials");
  });
});

test.describe("accesibilidad como admin", () => {
  test.use({ storageState: storageFile("admin") });

  const pages = [
    { path: "/dashboard", ready: "Dashboard" },
    { path: "/devoluciones", ready: "Casos registrados" },
    { path: "/reportes-carga", ready: "Casos registrados" },
    { path: "/usuarios", ready: "Equipo y permisos" },
  ];

  for (const { path, ready } of pages) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: ready }).first(),
      ).toBeVisible();
      await expectNoAccessibilityViolations(page, path);
    });
  }

  test("modal de nueva devolución", async ({ page }) => {
    await page.goto("/devoluciones");
    await page.getByRole("button", { name: "+ Nueva devolucion" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAccessibilityViolations(page, "modal de nueva devolución");
  });

  test("modal de nuevo reporte de carga", async ({ page }) => {
    await page.goto("/reportes-carga");
    await page.getByRole("button", { name: "+ Nuevo reporte" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAccessibilityViolations(page, "modal de reporte de carga");
  });
});

test.describe("accesibilidad de los roles operativos", () => {
  test.describe("pesado", () => {
    test.use({ storageState: storageFile("pesado") });

    test("dashboard de colas de trabajo", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
      await expectNoAccessibilityViolations(page, "/dashboard (pesado)");
    });
  });
});
