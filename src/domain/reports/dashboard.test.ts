import { describe, expect, it } from "vitest";

import {
  addDays,
  isoDate,
  resolvePeriod,
  splitPeriod,
} from "./dashboard-period";
import {
  buildExecutiveDashboard,
  type CargaFact,
  type DevolucionFact,
} from "./dashboard-snapshot";

const PERIOD = resolvePeriod({ from: "2026-10-01", to: "2026-10-30" });

function at(day: string, hour = 12): string {
  return `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function devolucion(
  id: number,
  created: string,
  estado: string,
  extra: Partial<DevolucionFact> = {},
): DevolucionFact {
  return {
    id: `d-${id}`,
    factura: `F-${id}`,
    articulo: id % 2 ? "Cocina" : "Lavadora",
    cantidad: 2 + (id % 3),
    estado_material: ["bueno", "malo", "mixto"][id % 3],
    transportista_nombre: id % 4 ? "Ana" : null,
    placa_camion: id % 5 ? `P-${id % 3}` : null,
    estado,
    created_at: created,
    cerrado_at: estado === "cerrada" ? at("2026-10-29", 18) : null,
    flujo_inicial: id % 2 ? "pesado" : "almacen",
    ...extra,
  };
}

function carga(
  id: number,
  received: string,
  estado: string,
  extra: Partial<CargaFact> = {},
): CargaFact {
  return {
    id: `c-${id}`,
    numero_documento: id % 2 ? `DOC-${id}` : null,
    factura: `F-${id}`,
    cliente: id % 2 ? "Tienda Norte" : "Hogar Central",
    articulo: "Microondas",
    cantidad: 1 + id,
    transportista: id % 3 ? "Luis" : null,
    ruta: id % 2 ? "R-01" : null,
    placa: "C-1",
    motivo_no_entrega: id % 2 ? "Cliente ausente" : "Direccion incorrecta",
    estado_fisico_carga: id % 2 ? "Buen estado" : "Mal estado",
    estado,
    recibido_at: received,
    redespachado_at: estado === "redespachado" ? at("2026-10-28") : null,
    created_at: received,
    ...extra,
  };
}

const devoluciones = [
  devolucion(1, at("2026-10-02"), "pendiente_entrega"),
  devolucion(2, at("2026-10-05"), "pendiente_proceso"),
  devolucion(3, at("2026-10-10"), "recibida_bodega"),
  devolucion(4, at("2026-10-12"), "pendiente_ubicar"),
  devolucion(5, at("2026-10-15"), "pendiente_disposicion"),
  devolucion(6, at("2026-10-20"), "cerrada"),
  devolucion(7, at("2026-10-28"), "cerrada"),
  devolucion(8, at("2026-10-29"), "pendiente_entrega"),
  // Periodo anterior.
  devolucion(9, at("2026-09-10"), "cerrada"),
  devolucion(10, at("2026-09-20"), "pendiente_entrega"),
];

const cargas = [
  carga(1, at("2026-10-03"), "pendiente_redespacho"),
  carga(2, at("2026-10-08"), "redespachado"),
  carga(3, at("2026-10-25"), "recibido_muelle"),
  carga(4, at("2026-09-15"), "redespachado"),
];

describe("periodo del dashboard", () => {
  it("usa el rango pedido y calcula el periodo anterior de igual duración", () => {
    expect(PERIOD.from).toBe("2026-10-01");
    expect(PERIOD.to).toBe("2026-10-30");
    expect(PERIOD.days).toBe(30);
    expect(PERIOD.previousTo).toBe("2026-09-30");
    expect(PERIOD.previousFrom).toBe("2026-09-01");
  });

  it("sin rango válido usa los últimos días pedidos", () => {
    const period = resolvePeriod({ days: 7 });
    expect(period.days).toBe(7);
    expect(resolvePeriod({ from: "2026-10-30", to: "2026-10-01" }).days).toBe(
      30,
    );
  });

  it("reparte las filas entre el periodo actual y el anterior", () => {
    const split = splitPeriod(devoluciones, (row) => row.created_at, PERIOD);
    expect(split.current).toHaveLength(8);
    expect(split.previous).toHaveLength(2);
    expect(isoDate(addDays(new Date(at("2026-10-31")), 1))).toBe("2026-11-01");
  });
});

describe("dashboard ejecutivo", () => {
  const data = buildExecutiveDashboard({
    period: PERIOD,
    devolucionesRows: devoluciones,
    cargaRows: cargas,
    includeCarga: true,
  });

  it("resume devoluciones con KPI, estados, tendencia y antigüedad", () => {
    const base = data.devoluciones.base;
    expect(base.total).toBe(8);
    expect(base.kpis.length).toBeGreaterThan(0);
    expect(base.states.reduce((sum, p) => sum + p.value, 0)).toBe(8);
    expect(base.trend.length).toBeGreaterThan(0);
    expect(base.aging.length).toBeGreaterThan(0);
    expect(base.flow.map((p) => p.key).sort()).toEqual(["almacen", "pesado"]);
    expect(base.attention.length).toBeGreaterThan(0);
  });

  it("precalcula una vista por cada valor seleccionable", () => {
    const keys = Object.keys(data.devoluciones.selections);
    expect(keys.length).toBeGreaterThan(5);
    const pesado = Object.entries(data.devoluciones.selections).find(([key]) =>
      key.includes("pesado"),
    )?.[1];
    expect(pesado?.total).toBe(4);
  });

  it("resume reportes de carga solo cuando se piden", () => {
    expect(data.carga?.base.total).toBe(3);
    expect(data.carga?.base.physical.length).toBe(2);
    expect(Object.keys(data.carga?.selections ?? {}).length).toBeGreaterThan(3);

    const sinCarga = buildExecutiveDashboard({
      period: PERIOD,
      devolucionesRows: devoluciones,
      cargaRows: [],
      includeCarga: false,
    });
    expect(sinCarga.carga).toBeNull();
  });

  it("tolera un periodo sin datos", () => {
    const empty = buildExecutiveDashboard({
      period: PERIOD,
      devolucionesRows: [],
      cargaRows: [],
      includeCarga: true,
    });
    expect(empty.devoluciones.base.total).toBe(0);
    expect(empty.carga?.base.total).toBe(0);
  });
});
