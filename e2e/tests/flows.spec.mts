import { expect, test, type Page } from "@playwright/test";

import { e2eRef, EVIDENCE, storageFile } from "./support.mts";

// Carga una evidencia en el selector de la etapa (botón «Subir imagen»).
async function attach(dialog: ReturnType<Page["getByRole"]>, label: string) {
  const picker = dialog.locator(".dx-evidence-picker", { hasText: label });
  await picker
    .locator("input.dx-evidence-source")
    .first()
    .setInputFiles(EVIDENCE);
  await expect(picker.getByRole("button", { name: "Quitar" })).toBeVisible();
}

test.describe.serial("devolución del flujo Pesado", () => {
  let factura = "";
  test.beforeAll(() => {
    factura = e2eRef("PES");
  });

  test.describe("registro", () => {
    test.use({ storageState: storageFile("devoluciones") });

    test("devoluciones registra la devolución con sus evidencias", async ({
      page,
    }) => {
      await page.goto("/devoluciones");
      await page.getByRole("button", { name: "+ Nueva devolucion" }).click();
      const dialog = page.getByRole("dialog", { name: "Registrar devolucion" });

      await dialog.getByPlaceholder("Factura").fill(factura);
      await dialog.getByPlaceholder("Articulo").fill("Cocina electrica");
      await dialog.getByPlaceholder("Cantidad").fill("3");
      await dialog
        .getByPlaceholder("Transportista", { exact: true })
        .fill("Transportista E2E");
      await dialog.getByPlaceholder("Cedula transportista").fill("0-0000-0000");
      await dialog.getByPlaceholder("Placa", { exact: true }).fill("E2E-001");
      await dialog
        .getByPlaceholder("Descripcion del material")
        .fill("Puerta golpeada en el traslado.");
      await attach(dialog, "Factura");
      await attach(dialog, "Material / tarima");
      await dialog.getByRole("button", { name: "Crear devolucion" }).click();

      await expect(page).toHaveURL(/success=created/);
      await page.goto(`/devoluciones?search=${factura}`);
      await expect(page.getByText(`Factura ${factura}`)).toBeVisible();
      await expect(page.locator(".v3-case-card").first()).toContainText(
        "Pendiente de entrega",
      );
    });
  });

  test.describe("recepción", () => {
    test.use({ storageState: storageFile("pesado") });

    test("pesado confirma la recepción física", async ({ page }) => {
      await page.goto(`/devoluciones?search=${factura}`);
      const card = page.locator(".v3-case-card", {
        hasText: `Factura ${factura}`,
      });
      await card.getByRole("button", { name: "Recepcion" }).click();
      const dialog = page.getByRole("dialog");

      await dialog.getByPlaceholder("Cantidad recibida").fill("3");
      await attach(dialog, "Factura firmada");
      await attach(dialog, "Material bueno");
      await dialog.getByRole("button", { name: "Confirmar recepcion" }).click();

      await expect(page).toHaveURL(/success=/);
      await page.goto(`/devoluciones?search=${factura}`);
      await expect(
        page.locator(".v3-case-card", { hasText: `Factura ${factura}` }),
      ).toContainText("Recibida en bodega");
    });
  });

  test.describe("detalle", () => {
    test.use({ storageState: storageFile("admin") });

    test("admin ve la trazabilidad completa del caso", async ({ page }) => {
      await page.goto(`/devoluciones?search=${factura}`);
      await page
        .locator(".v3-case-card", { hasText: `Factura ${factura}` })
        .getByRole("link", { name: "Ver detalle" })
        .click();
      const detail = page.locator(".dx-route-modal");
      await expect(detail).toContainText("Trazabilidad");
      await expect(detail.locator(".dx-timeline article")).toHaveCount(2);
    });
  });
});

test.describe("reporte de carga", () => {
  test.use({ storageState: storageFile("transportes") });

  test("transportes registra un retorno pendiente de envío", async ({
    page,
  }) => {
    const documento = e2eRef("DOC");
    await page.goto("/reportes-carga");
    await page.getByRole("button", { name: "+ Nuevo reporte" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByPlaceholder("Numero documento").fill(documento);
    await dialog.getByPlaceholder("Cliente *").fill("Cliente E2E");
    await dialog.getByPlaceholder("Articulo *").fill("Microondas");
    await dialog.getByPlaceholder("Cantidad *").fill("2");
    await dialog
      .locator("select[name=estadoFisicoCarga]")
      .selectOption("Buen estado");
    await dialog
      .getByPlaceholder("Motivo de no entrega *")
      .fill("Cliente ausente");
    await attach(dialog, "Evidencia de recepcion");
    await dialog.getByRole("button", { name: "Registrar retorno" }).click();

    await expect(page).toHaveURL(/success=/);
    await page.goto(`/reportes-carga?search=Cliente%20E2E`);
    await expect(
      page.locator(".v3-case-card", { hasText: `Documento ${documento}` }),
    ).toContainText("Pendiente de envio");
  });
});
