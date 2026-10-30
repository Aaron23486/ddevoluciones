import { describe, expect, it } from "vitest";
import {
  deriveParentState,
  validateMixedQuantities,
} from "@/domain/devoluciones/state-machine";

describe("dominio de devoluciones", () => {
  it("valida cantidades mixtas", () => {
    expect(validateMixedQuantities(10, 6, 4)).toBe(true);
    expect(validateMixedQuantities(10, 6, 3)).toBe(false);
    expect(validateMixedQuantities(10, 0, 10)).toBe(false);
  });

  it("prioriza recibido mientras Inventario no procese", () => {
    expect(
      deriveParentState([
        { tipo_material: "bueno", estado: "recibido" },
        { tipo_material: "malo", estado: "recibido" },
      ]),
    ).toBe("recibida_bodega");
  });

  it("prioriza pendiente_ubicar en Mixto", () => {
    expect(
      deriveParentState([
        { tipo_material: "bueno", estado: "pendiente_ubicar" },
        { tipo_material: "malo", estado: "pendiente_disposicion" },
      ]),
    ).toBe("pendiente_ubicar");
  });

  it("pasa a pendiente_disposicion cuando bueno ya cerro", () => {
    expect(
      deriveParentState([
        { tipo_material: "bueno", estado: "cerrada" },
        { tipo_material: "malo", estado: "pendiente_disposicion" },
      ]),
    ).toBe("pendiente_disposicion");
  });

  it("cierra padre cuando todos los hijos cierran", () => {
    expect(
      deriveParentState([
        { tipo_material: "bueno", estado: "cerrada" },
        { tipo_material: "malo", estado: "cerrada" },
      ]),
    ).toBe("cerrada");
  });
});
