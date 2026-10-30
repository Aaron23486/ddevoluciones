import { describe, expect, it } from "vitest";
import { getFinalNavigation } from "@/constants/final-navigation";
import { USER_ROLES } from "@/constants/roles";

const FINAL_NAVIGATION_BY_ROLE = Object.fromEntries(
  USER_ROLES.map((role) => [role, getFinalNavigation(role)]),
) as Record<(typeof USER_ROLES)[number], ReturnType<typeof getFinalNavigation>>;

describe("navegación final (contrato)", () => {
  it("solo contiene las rutas finales de la aplicación", () => {
    const allowed = new Set([
      "/dashboard",
      "/devoluciones",
      "/reportes-carga",
      "/usuarios",
    ]);

    for (const items of Object.values(FINAL_NAVIGATION_BY_ROLE)) {
      for (const item of items) {
        expect(allowed.has(item.href)).toBe(true);
      }
    }
  });

  it("ya no incluye las rutas operativas antiguas", () => {
    const all = Object.values(FINAL_NAVIGATION_BY_ROLE)
      .flat()
      .map((item) => item.href);

    expect(all).not.toContain("/recepcion");
    expect(all).not.toContain("/inventario");
    expect(all).not.toContain("/ubicacion");
    expect(all).not.toContain("/disposicion");
    expect(all).not.toContain("/reportes");
  });

  it("muestra reporte de carga a sus roles", () => {
    expect(
      FINAL_NAVIGATION_BY_ROLE.inventario.some(
        (item) => item.href === "/reportes-carga",
      ),
    ).toBe(true);
    expect(
      FINAL_NAVIGATION_BY_ROLE.transportes.some(
        (item) => item.href === "/reportes-carga",
      ),
    ).toBe(true);
    expect(
      FINAL_NAVIGATION_BY_ROLE.seguridad.some(
        (item) => item.href === "/reportes-carga",
      ),
    ).toBe(true);
  });
});
