import { describe, expect, it } from "vitest";
import {
  APP_ROUTES,
  canAccessRoute,
  getAllowedRoutes,
  getDefaultRoute,
  ROUTE_ROLES,
} from "@/constants/permissions";
import { getFinalNavigation } from "@/constants/final-navigation";
import { USER_ROLES } from "@/constants/roles";

describe("permisos por ruta", () => {
  it("solo admin entra a usuarios", () => {
    expect(ROUTE_ROLES["/usuarios"]).toEqual(["admin"]);
    expect(canAccessRoute("pesado", "/usuarios")).toBe(false);
  });

  it("transportes y seguridad solo ven reporte de carga", () => {
    expect(getAllowedRoutes("transportes")).toEqual(["/reportes-carga"]);
    expect(getAllowedRoutes("seguridad")).toEqual(["/reportes-carga"]);
  });

  it("devoluciones y los roles operativos no ven reporte de carga salvo inventario", () => {
    expect(canAccessRoute("devoluciones", "/reportes-carga")).toBe(false);
    expect(canAccessRoute("pesado", "/reportes-carga")).toBe(false);
    expect(canAccessRoute("almacen", "/reportes-carga")).toBe(false);
    expect(canAccessRoute("inventario", "/reportes-carga")).toBe(true);
  });

  it("cada rol tiene al menos una ruta y su ruta inicial es accesible", () => {
    for (const role of USER_ROLES) {
      const route = getDefaultRoute(role);
      expect(APP_ROUTES).toContain(route);
      expect(canAccessRoute(role, route)).toBe(true);
    }
  });

  it("la navegación muestra exactamente las rutas permitidas", () => {
    for (const role of USER_ROLES) {
      expect(getFinalNavigation(role).map((item) => item.href)).toEqual(
        getAllowedRoutes(role),
      );
    }
  });
});
