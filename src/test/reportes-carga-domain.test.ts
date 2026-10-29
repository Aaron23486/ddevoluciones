import { describe, expect, it } from "vitest";
import {
  devolucionBucket,
  percentage,
  reporteCargaBucket,
} from "@/domain/reports/analytics";
import {
  createReporteCargaSchema,
  redispatchReporteCargaSchema,
} from "@/schemas/reportes-carga";

describe("Epic 4 domain contract", () => {
  it("clasifica buckets de devoluciones", () => {
    expect(devolucionBucket("pendiente_entrega")).toBe("entrada");
    expect(devolucionBucket("recibida_bodega")).toBe("en_proceso");
    expect(devolucionBucket("pendiente_ubicar")).toBe("pendiente_accion");
    expect(devolucionBucket("pendiente_disposicion")).toBe("pendiente_accion");
    expect(devolucionBucket("cerrada")).toBe("resuelto");
  });

  it("clasifica buckets de reporte de carga", () => {
    expect(reporteCargaBucket("pendiente_redespacho")).toBe("pendiente_accion");
    expect(reporteCargaBucket("recibido_muelle")).toBe("pendiente_accion");
    expect(reporteCargaBucket("redespachado")).toBe("resuelto");
  });

  it("calcula porcentajes", () => {
    expect(percentage(5, 10)).toBe(50);
    expect(percentage(0, 0)).toBe(0);
  });

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
