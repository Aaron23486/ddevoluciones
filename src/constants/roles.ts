export const USER_ROLES = [
  "admin",
  "devoluciones",
  "pesado",
  "inventario",
  "almacen",
  "transportes",
  "seguridad",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export const REQUESTABLE_ROLES = [
  "devoluciones",
  "pesado",
  "inventario",
  "almacen",
] as const;

export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];
