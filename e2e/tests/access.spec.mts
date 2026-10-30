import { expect, test } from "@playwright/test";

import { e2eData, signInThroughForm, storageFile } from "./support.mts";

test.describe("sin sesión", () => {
  test("las rutas protegidas llevan al ingreso", async ({ page }) => {
    for (const path of ["/dashboard", "/devoluciones", "/usuarios"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("credenciales incorrectas muestran un mensaje sin revelar la cuenta", async ({
    page,
  }) => {
    await signInThroughFormExpectingError(page);
    await expect(
      page.getByText("Correo o contrasena incorrectos."),
    ).toBeVisible();
  });

  test("ingresar y cerrar sesión", async ({ page }) => {
    await signInThroughForm(page, e2eData().accounts.signout);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.locator(".dx-profile-menu summary").click();
    await page.getByRole("button", { name: "Cerrar sesion" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/devoluciones");
    await expect(page).toHaveURL(/\/login/);
  });
});

async function signInThroughFormExpectingError(
  page: import("@playwright/test").Page,
) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("nadie@example.test");
  await page.getByLabel(/Contrase/).fill("Clave-incorrecta-123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/login\?error=credentials/);
}

test.describe("navegación por rol", () => {
  const cases = [
    {
      role: "admin",
      links: ["Dashboard", "Devoluciones", "Reporte de carga", "Usuarios"],
    },
    { role: "devoluciones", links: ["Dashboard", "Devoluciones"] },
    {
      role: "inventario",
      links: ["Dashboard", "Devoluciones", "Reporte de carga"],
    },
    { role: "transportes", links: ["Reporte de carga"] },
  ] as const;

  for (const { role, links } of cases) {
    test.describe(role, () => {
      test.use({ storageState: storageFile(role) });

      test("el menú muestra solo sus módulos", async ({ page }) => {
        await page.goto(
          role === "transportes" ? "/reportes-carga" : "/dashboard",
        );
        const nav = page.getByRole("navigation", {
          name: "Navegacion principal",
        });
        for (const link of links) {
          await expect(nav.getByRole("link", { name: link })).toBeVisible();
        }
        await expect(nav.getByRole("link")).toHaveCount(links.length);
      });
    });
  }

  test.describe("rutas prohibidas", () => {
    test.use({ storageState: storageFile("transportes") });

    test("transportes no entra a devoluciones, dashboard ni usuarios", async ({
      page,
    }) => {
      for (const path of ["/devoluciones", "/dashboard", "/usuarios"]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/reportes-carga/);
      }
    });
  });

  test.describe("usuarios solo para admin", () => {
    test.use({ storageState: storageFile("pesado") });

    test("pesado es redirigido fuera de usuarios", async ({ page }) => {
      await page.goto("/usuarios");
      await expect(page).toHaveURL(/\/dashboard\?error=forbidden/);
    });
  });
});
