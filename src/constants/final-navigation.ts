import type { UserRole } from "@/constants/roles";

export type FinalNavigationItem = {
  href: "/dashboard" | "/devoluciones" | "/reportes-carga" | "/usuarios";
  label: string;
  short: string;
};

const DASHBOARD: FinalNavigationItem = {
  href: "/dashboard",
  label: "Dashboard",
  short: "DB",
};

const DEVOLUCIONES: FinalNavigationItem = {
  href: "/devoluciones",
  label: "Devoluciones",
  short: "DV",
};

const CARGA: FinalNavigationItem = {
  href: "/reportes-carga",
  label: "Reporte de carga",
  short: "CG",
};

const USUARIOS: FinalNavigationItem = {
  href: "/usuarios",
  label: "Usuarios",
  short: "US",
};

export const FINAL_NAVIGATION_BY_ROLE: Record<
  UserRole,
  readonly FinalNavigationItem[]
> = {
  admin: [DASHBOARD, DEVOLUCIONES, CARGA, USUARIOS],
  devoluciones: [DASHBOARD, DEVOLUCIONES],
  pesado: [DASHBOARD, DEVOLUCIONES],
  inventario: [DASHBOARD, DEVOLUCIONES, CARGA],
  almacen: [DASHBOARD, DEVOLUCIONES],
  transportes: [CARGA],
  seguridad: [CARGA],
};

export function getFinalNavigation(role: UserRole) {
  return FINAL_NAVIGATION_BY_ROLE[role];
}

export function getFinalDefaultRoute(role: UserRole): string {
  return FINAL_NAVIGATION_BY_ROLE[role][0]?.href ?? "/dashboard";
}