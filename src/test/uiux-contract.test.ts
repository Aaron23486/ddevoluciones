import { describe, expect, it } from "vitest";
import { getFinalNavigation } from "@/constants/final-navigation";
import { USER_ROLES } from "@/constants/roles";

const FINAL_NAVIGATION_BY_ROLE = Object.fromEntries(
  USER_ROLES.map((role) => [role, getFinalNavigation(role)]),
) as Record<(typeof USER_ROLES)[number], ReturnType<typeof getFinalNavigation>>;

describe("destinos de la interfaz (contrato)", () => {
  it("solo ofrece los cuatro destinos finales", () => {
    const allowed = new Set([
      "/dashboard",
      "/devoluciones",
      "/reportes-carga",
      "/usuarios",
    ]);

    for (const links of Object.values(FINAL_NAVIGATION_BY_ROLE)) {
      for (const link of links) {
        expect(allowed.has(link.href)).toBe(true);
      }
    }
  });

  it("admin ve la navegación completa", () => {
    expect(FINAL_NAVIGATION_BY_ROLE.admin.map((item) => item.href)).toEqual([
      "/dashboard",
      "/devoluciones",
      "/reportes-carga",
      "/usuarios",
    ]);
  });
});
