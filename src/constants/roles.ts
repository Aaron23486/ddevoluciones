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

export const REQUESTABLE_ROLES = [
  "devoluciones",
  "pesado",
  "inventario",
  "almacen",
] as const;

export type RequestableRole =
  (typeof REQUESTABLE_ROLES)[number];
