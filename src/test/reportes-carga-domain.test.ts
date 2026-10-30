import { describe, expect, it } from "vitest";
import {
  createReporteCargaSchema,
  redispatchReporteCargaSchema,
} from "@/schemas/reportes-carga";

describe("esquemas de reportes de carga", () => {
  it("valida alta de reporte con campos originales obligatorios", () => {
    expect(
      createReporteCargaSchema.safeParse({
        cliente: "Cliente Demo",
        articulo: "ART-1",
        cantidad: 5,
        motivoNoEntrega: "Cliente ausente",
        estadoFisicoCarga: "Buen estado",
      }).success,
    ).toBe(true);

    expect(
      createReporteCargaSchema.safeParse({
        cliente: "Cliente Demo",
        articulo: "",
        cantidad: 5,
        motivoNoEntrega: "Cliente ausente",
        estadoFisicoCarga: "Buen estado",
      }).success,
    ).toBe(false);
  });

  it("valida redespacho con conductor, placa y observaciones", () => {
    expect(
      redispatchReporteCargaSchema.safeParse({
        reporteCargaId: "11111111-1111-4111-8111-111111111111",
        conductor: "Conductor Demo",
        placaSalida: "ABC123",
        observaciones: "Salida confirmada",
      }).success,
    ).toBe(true);
  });
});
