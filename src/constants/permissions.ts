import type { UserRole } from "@/constants/roles";

export const APP_VIEWS = [
  "dashboard",
  "devoluciones",
  "recepcion",
  "inventario",
  "ubicacion",
  "disposicion",
  "reportes",
  "reportes-carga",
  "usuarios",
] as const;

export type AppView = (typeof APP_VIEWS)[number];

export const ROLE_VIEWS: Record<UserRole, readonly AppView[]> = {
  admin: [
    "dashboard",
    "devoluciones",
    "recepcion",
    "inventario",
    "ubicacion",
    "disposicion",
    "reportes",
    "reportes-carga",
    "usuarios",
  ],

  devoluciones: ["devoluciones", "reportes"],

  pesado: ["dashboard", "recepcion", "ubicacion"],

  inventario: ["dashboard", "inventario", "disposicion", "reportes-carga"],

  almacen: ["dashboard", "ubicacion"],

  transportes: ["reportes-carga"],

  seguridad: ["reportes-carga"],
};

export function canAccessView(role: UserRole, view: AppView): boolean {
  return ROLE_VIEWS[role].includes(view);
}
