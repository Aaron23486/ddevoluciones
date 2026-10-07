export type Flow = "pesado" | "almacen";
export type Classification = "bueno" | "malo" | "mixto";
export type ParentState =
  | "pendiente_entrega"
  | "pendiente_proceso"
  | "recibida_bodega"
  | "pendiente_ubicar"
  | "pendiente_disposicion"
  | "cerrada";

export type MaterialState =
  | "recibido"
  | "pendiente_ubicar"
  | "pendiente_disposicion"
  | "cerrada";

export type MaterialSnapshot = {
  tipo_material: "bueno" | "malo";
  estado: MaterialState;
};

export function validateMixedQuantities(
  total: number,
  good: number,
  bad: number,
): boolean {
  return (
    Number.isInteger(total) &&
    Number.isInteger(good) &&
    Number.isInteger(bad) &&
    total > 0 &&
    good > 0 &&
    bad > 0 &&
    good + bad === total
  );
}

export function deriveParentState(
  materials: readonly MaterialSnapshot[],
): ParentState | null {
  if (materials.length === 0) return null;

  if (materials.every((material) => material.estado === "cerrada")) {
    return "cerrada";
  }

  if (materials.some((material) => material.estado === "recibido")) {
    return "recibida_bodega";
  }

  if (
    materials.some(
      (material) =>
        material.tipo_material === "bueno" &&
        material.estado === "pendiente_ubicar",
    )
  ) {
    return "pendiente_ubicar";
  }

  if (
    materials.some(
      (material) =>
        material.tipo_material === "malo" &&
        material.estado === "pendiente_disposicion",
    )
  ) {
    return "pendiente_disposicion";
  }

  return null;
}