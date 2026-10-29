import { describe, expect, it } from "vitest";
import { canAccessView, ROLE_VIEWS } from "@/constants/permissions";

describe("permissions SSOT", () => {
  it("admin puede acceder a usuarios", () => {
    expect(canAccessView("admin", "usuarios")).toBe(true);
  });

  it("pesado no puede acceder a usuarios", () => {
    expect(canAccessView("pesado", "usuarios")).toBe(false);
  });

  it("transportes solo tiene reporte de carga", () => {
    expect(ROLE_VIEWS.transportes).toEqual(["reportes-carga"]);
  });

  it("seguridad solo tiene reporte de carga", () => {
    expect(ROLE_VIEWS.seguridad).toEqual(["reportes-carga"]);
  });
});
