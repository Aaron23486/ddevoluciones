import { describe, expect, it } from "vitest";

import { caseActions } from "./case-actions";

const pesado = { flujo_inicial: "pesado", estado: "pendiente_entrega" };
const almacen = { flujo_inicial: "almacen", estado: "pendiente_proceso" };

describe("acciones de la tarjeta de devolución", () => {
  it("pesado recibe solo casos de su flujo pendientes de entrega", () => {
    expect(caseActions("pesado", pesado).receive).toBe(true);
    expect(caseActions("pesado", almacen).receive).toBe(false);
    expect(caseActions("almacen", pesado).receive).toBe(false);
  });

  it("inventario procesa casos recibidos o pendientes de proceso", () => {
    expect(caseActions("inventario", almacen).inventory).toBe(true);
    expect(caseActions("inventario", pesado).inventory).toBe(false);
    expect(caseActions("pesado", almacen).inventory).toBe(false);
  });

  it("cada flujo ubica su material; inventario dispone", () => {
    expect(caseActions("pesado", pesado).locate).toBe(true);
    expect(caseActions("almacen", almacen).locate).toBe(true);
    expect(caseActions("almacen", pesado).locate).toBe(false);
    expect(caseActions("inventario", pesado).dispose).toBe(true);
    expect(caseActions("devoluciones", pesado).dispose).toBe(false);
  });

  it("solo admin elimina y puede hacer todas las etapas", () => {
    expect(caseActions("admin", pesado)).toEqual({
      receive: true,
      inventory: false,
      locate: true,
      dispose: true,
      remove: true,
    });
    expect(caseActions("devoluciones", pesado).remove).toBe(false);
  });
});
