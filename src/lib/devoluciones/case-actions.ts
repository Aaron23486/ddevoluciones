import type { UserRole } from "@/constants/roles";

export const STATE_LABELS: Record<string, string> = {
  pendiente_entrega: "Pendiente de entrega",
  pendiente_proceso: "Pendiente de proceso",
  recibida_bodega: "Recibida en bodega",
  pendiente_ubicar: "Pendiente de ubicar",
  pendiente_disposicion: "Pendiente de disposicion",
  cerrada: "Cerrada",
};

type CaseSnapshot = { flujo_inicial: string; estado: string };

export type CaseActions = {
  receive: boolean;
  inventory: boolean;
  locate: boolean;
  dispose: boolean;
  remove: boolean;
};

// Acciones que la tarjeta ofrece a cada rol según el flujo y el estado del caso. Es solo
// presentación: las RPC vuelven a comprobar rol, flujo y estado.
export function caseActions(role: UserRole, row: CaseSnapshot): CaseActions {
  return {
    receive:
      (role === "admin" || role === "pesado") &&
      row.flujo_inicial === "pesado" &&
      row.estado === "pendiente_entrega",
    inventory:
      (role === "admin" || role === "inventario") &&
      ["recibida_bodega", "pendiente_proceso"].includes(row.estado),
    locate:
      role === "admin" ||
      (role === "pesado" && row.flujo_inicial === "pesado") ||
      (role === "almacen" && row.flujo_inicial === "almacen"),
    dispose: role === "admin" || role === "inventario",
    remove: role === "admin",
  };
}
