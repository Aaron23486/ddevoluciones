import type { UserRole } from "@/constants/roles";

// Única fuente de acceso por ruta: la usan las páginas (requireRole),
// la navegación y la redirección después del login. La autoridad final
// sigue siendo la base de datos (RLS y RPC).
export const APP_ROUTES = [
  "/dashboard",
  "/devoluciones",
  "/reportes-carga",
  "/usuarios",
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

export const ROUTE_ROLES: Record<AppRoute, readonly UserRole[]> = {
  "/dashboard": ["admin", "devoluciones", "pesado", "inventario", "almacen"],
  "/devoluciones": ["admin", "devoluciones", "pesado", "inventario", "almacen"],
  "/reportes-carga": ["admin", "inventario", "transportes", "seguridad"],
  "/usuarios": ["admin"],
};

export function canAccessRoute(role: UserRole, route: AppRoute): boolean {
  return ROUTE_ROLES[route].includes(role);
}

export function getAllowedRoutes(role: UserRole): AppRoute[] {
  return APP_ROUTES.filter((route) => canAccessRoute(role, route));
}

export function getDefaultRoute(role: UserRole): AppRoute {
  return getAllowedRoutes(role)[0] ?? "/dashboard";
}
