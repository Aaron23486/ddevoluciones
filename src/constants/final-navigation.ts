import { getAllowedRoutes, type AppRoute } from "@/constants/permissions";
import type { UserRole } from "@/constants/roles";

export type FinalNavigationItem = {
  href: AppRoute;
  label: string;
  short: string;
};

const NAVIGATION_ITEMS: Record<AppRoute, FinalNavigationItem> = {
  "/dashboard": { href: "/dashboard", label: "Dashboard", short: "DB" },
  "/devoluciones": {
    href: "/devoluciones",
    label: "Devoluciones",
    short: "DV",
  },
  "/reportes-carga": {
    href: "/reportes-carga",
    label: "Reporte de carga",
    short: "CG",
  },
  "/usuarios": { href: "/usuarios", label: "Usuarios", short: "US" },
};

export function getFinalNavigation(
  role: UserRole,
): readonly FinalNavigationItem[] {
  return getAllowedRoutes(role).map((route) => NAVIGATION_ITEMS[route]);
}
