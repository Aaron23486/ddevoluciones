export type OperationalBucket =
  "entrada" | "en_proceso" | "pendiente_accion" | "resuelto";

export function devolucionBucket(state: string): OperationalBucket {
  if (state === "cerrada") return "resuelto";
  if (state === "pendiente_ubicar" || state === "pendiente_disposicion") {
    return "pendiente_accion";
  }
  if (state === "recibida_bodega") return "en_proceso";
  return "entrada";
}

export function reporteCargaBucket(state: string): OperationalBucket {
  return state === "redespachado" ? "resuelto" : "pendiente_accion";
}

export function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}
