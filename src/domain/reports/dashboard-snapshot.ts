// Instantáneas del dashboard ejecutivo para devoluciones y reportes de carga, con las
// vistas filtradas por selección. Lógica pura: la lectura vive en
// src/repositories/dashboard-analytics.ts.

import type {
  DashboardMetricPoint,
  DashboardModeData,
  DashboardPeriod,
  DashboardSelectionDimension,
  DashboardSnapshot,
  ExecutiveDashboardData,
} from "@/types/dashboard";
import { splitPeriod } from "./dashboard-period";
import {
  DEV_STATE_COLORS,
  LOAD_STATE_COLORS,
  DEV_STATE_LABELS,
  LOAD_STATE_LABELS,
  percentageChange,
  kpi,
  countBy,
  metricPoints,
  formatDuration,
  averageCycleHours,
  agingPoints,
  buildTrend,
  agedOverSeven,
  makeAttention,
} from "./dashboard-metrics";

export type DevolucionFact = {
  id: string;
  factura: string;
  articulo: string;
  cantidad: number;
  estado_material: string;
  transportista_nombre: string | null;
  placa_camion: string | null;
  estado: string;
  created_at: string;
  cerrado_at: string | null;
  flujo_inicial: string;
};

export type CargaFact = {
  id: string;
  numero_documento: string | null;
  factura: string | null;
  cliente: string;
  articulo: string;
  cantidad: number;
  transportista: string | null;
  ruta: string | null;
  placa: string | null;
  motivo_no_entrega: string;
  estado_fisico_carga: string | null;
  estado: string;
  recibido_at: string | null;
  redespachado_at: string | null;
  created_at: string;
};

export function filterDevoluciones(
  rows: DevolucionFact[],
  dimension: DashboardSelectionDimension,
  key: string,
): DevolucionFact[] {
  return rows.filter((row) => {
    switch (dimension) {
      case "state":
        return row.estado === key;
      case "flow":
        return row.flujo_inicial === key;
      case "material":
        return row.estado_material === key;
      case "article":
        return row.articulo === key;
      case "carrier":
        return (row.transportista_nombre ?? "") === key;
      case "plate":
        return (row.placa_camion ?? "") === key;
      default:
        return true;
    }
  });
}

export function filterCarga(
  rows: CargaFact[],
  dimension: DashboardSelectionDimension,
  key: string,
): CargaFact[] {
  return rows.filter((row) => {
    switch (dimension) {
      case "state":
        return row.estado === key;
      case "route":
        return (row.ruta ?? "") === key;
      case "client":
        return row.cliente === key;
      case "carrier":
        return (row.transportista ?? "") === key;
      case "physical":
        return (row.estado_fisico_carga ?? "") === key;
      case "motive":
        return row.motivo_no_entrega === key;
      default:
        return true;
    }
  });
}

export function buildDevolucionSnapshot(
  current: DevolucionFact[],
  previous: DevolucionFact[],
  period: DashboardPeriod,
): DashboardSnapshot {
  const open = current.filter((row) => row.estado !== "cerrada");
  const previousOpen = previous.filter((row) => row.estado !== "cerrada");
  const closed = current.filter((row) => row.estado === "cerrada");
  const previousClosed = previous.filter((row) => row.estado === "cerrada");
  const locate = current.filter((row) => row.estado === "pendiente_ubicar");
  const previousLocate = previous.filter(
    (row) => row.estado === "pendiente_ubicar",
  );
  const dispose = current.filter(
    (row) => row.estado === "pendiente_disposicion",
  );
  const previousDispose = previous.filter(
    (row) => row.estado === "pendiente_disposicion",
  );

  const cycle = averageCycleHours(
    closed,
    (row) => row.created_at,
    (row) => row.cerrado_at,
  );

  const previousCycle = averageCycleHours(
    previousClosed,
    (row) => row.created_at,
    (row) => row.cerrado_at,
  );

  const aged = agedOverSeven(
    current,
    (row) => row.estado !== "cerrada",
    (row) => row.created_at,
  );

  const previousAged = agedOverSeven(
    previous,
    (row) => row.estado !== "cerrada",
    (row) => row.created_at,
  );

  const states = metricPoints(
    countBy(current, (row) => row.estado),
    DEV_STATE_LABELS,
    DEV_STATE_COLORS,
    10,
  );

  const backlogStates = states.filter((item) => item.key !== "cerrada");
  const bottleneck = [...backlogStates].sort((a, b) => b.value - a.value)[0];

  const openChange = percentageChange(open.length, previousOpen.length);
  const closedChange = percentageChange(closed.length, previousClosed.length);

  return {
    total: current.length,
    kpis: [
      kpi(
        "open",
        "Casos abiertos",
        open.length,
        previousOpen.length,
        String(open.length),
        "blue",
      ),
      kpi(
        "closed",
        "Cerradas",
        closed.length,
        previousClosed.length,
        String(closed.length),
        "green",
      ),
      kpi(
        "location",
        "Pendiente de ubicar",
        locate.length,
        previousLocate.length,
        String(locate.length),
        "orange",
      ),
      kpi(
        "disposition",
        "Pendiente de disposicion",
        dispose.length,
        previousDispose.length,
        String(dispose.length),
        "red",
      ),
      kpi(
        "cycle",
        "Tiempo promedio de ciclo",
        cycle,
        previousCycle,
        formatDuration(cycle),
        "violet",
      ),
      kpi("aged", "Mas de 7 dias", aged, previousAged, String(aged), "cyan"),
    ],
    states,
    trend: buildTrend(
      current,
      period,
      (row) => row.created_at,
      (row) => row.cerrado_at,
    ),
    aging: agingPoints(
      current,
      (row) => row.estado !== "cerrada",
      (row) => row.created_at,
    ),
    flow: metricPoints(
      countBy(current, (row) => row.flujo_inicial),
      { pesado: "Pesado", almacen: "Almacen" },
      { pesado: "#60a5fa", almacen: "#a78bfa" },
      10,
    ),
    material: metricPoints(
      countBy(current, (row) => row.estado_material),
      { bueno: "Bueno", malo: "Malo", mixto: "Mixto" },
      {
        bueno: "#4ade80",
        malo: "#f87171",
        mixto: "#a78bfa",
      },
      10,
    ),
    physical: [],
    motives: [],
    articles: metricPoints(
      countBy(current, (row) => row.articulo),
      {},
      {},
      7,
    ),
    carriers: metricPoints(
      countBy(current, (row) => row.transportista_nombre),
      {},
      {},
      7,
    ),
    plates: metricPoints(
      countBy(current, (row) => row.placa_camion),
      {},
      {},
      7,
    ),
    routes: [],
    clients: [],
    attention: makeAttention(aged, bottleneck, openChange, closedChange),
  };
}

export function buildCargaSnapshot(
  current: CargaFact[],
  previous: CargaFact[],
  period: DashboardPeriod,
): DashboardSnapshot {
  const received = current.filter((row) => row.estado === "recibido_muelle");
  const previousReceived = previous.filter(
    (row) => row.estado === "recibido_muelle",
  );
  const pending = current.filter(
    (row) => row.estado === "pendiente_redespacho",
  );
  const previousPending = previous.filter(
    (row) => row.estado === "pendiente_redespacho",
  );
  const sent = current.filter((row) => row.estado === "redespachado");
  const previousSent = previous.filter((row) => row.estado === "redespachado");

  const rate = current.length > 0 ? (sent.length / current.length) * 100 : 0;
  const previousRate =
    previous.length > 0 ? (previousSent.length / previous.length) * 100 : 0;

  const cycle = averageCycleHours(
    sent,
    (row) => row.recibido_at ?? row.created_at,
    (row) => row.redespachado_at,
  );

  const previousCycle = averageCycleHours(
    previousSent,
    (row) => row.recibido_at ?? row.created_at,
    (row) => row.redespachado_at,
  );

  const aged = agedOverSeven(
    current,
    (row) => row.estado !== "redespachado",
    (row) => row.recibido_at ?? row.created_at,
  );

  const previousAged = agedOverSeven(
    previous,
    (row) => row.estado !== "redespachado",
    (row) => row.recibido_at ?? row.created_at,
  );

  const states = metricPoints(
    countBy(current, (row) => row.estado),
    LOAD_STATE_LABELS,
    LOAD_STATE_COLORS,
    10,
  );

  const bottleneck = states
    .filter((item) => item.key !== "redespachado")
    .sort((a, b) => b.value - a.value)[0];

  const openCurrent = received.length + pending.length;
  const openPrevious = previousReceived.length + previousPending.length;

  return {
    total: current.length,
    kpis: [
      kpi(
        "received",
        "Recibidos en muelle",
        received.length,
        previousReceived.length,
        String(received.length),
        "blue",
      ),
      kpi(
        "pending",
        "Pendientes de envio",
        pending.length,
        previousPending.length,
        String(pending.length),
        "orange",
      ),
      kpi(
        "sent",
        "Enviados",
        sent.length,
        previousSent.length,
        String(sent.length),
        "green",
      ),
      kpi(
        "rate",
        "Tasa de envio",
        rate,
        previousRate,
        `${rate.toFixed(1)}%`,
        "violet",
      ),
      kpi(
        "cycle",
        "Tiempo promedio a redespacho",
        cycle,
        previousCycle,
        formatDuration(cycle),
        "cyan",
      ),
      kpi("aged", "Mas de 7 dias", aged, previousAged, String(aged), "red"),
    ],
    states,
    trend: buildTrend(
      current,
      period,
      (row) => row.recibido_at ?? row.created_at,
      (row) => row.redespachado_at,
    ),
    aging: agingPoints(
      current,
      (row) => row.estado !== "redespachado",
      (row) => row.recibido_at ?? row.created_at,
    ),
    flow: [],
    material: [],
    physical: metricPoints(
      countBy(current, (row) => row.estado_fisico_carga),
      {},
      {
        "Buen estado": "#4ade80",
        "Mal estado": "#f87171",
      },
      10,
    ),
    motives: metricPoints(
      countBy(current, (row) => row.motivo_no_entrega),
      {},
      {},
      7,
    ),
    articles: metricPoints(
      countBy(current, (row) => row.articulo),
      {},
      {},
      7,
    ),
    carriers: metricPoints(
      countBy(current, (row) => row.transportista),
      {},
      {},
      7,
    ),
    plates: metricPoints(
      countBy(current, (row) => row.placa),
      {},
      {},
      7,
    ),
    routes: metricPoints(
      countBy(current, (row) => row.ruta),
      {},
      {},
      7,
    ),
    clients: metricPoints(
      countBy(current, (row) => row.cliente),
      {},
      {},
      7,
    ),
    attention: makeAttention(
      aged,
      bottleneck,
      percentageChange(openCurrent, openPrevious),
      percentageChange(sent.length, previousSent.length),
    ),
  };
}

export function makeSelectionSnapshots<T>(
  current: T[],
  previous: T[],
  dimensions: Array<{
    dimension: DashboardSelectionDimension;
    points: DashboardMetricPoint[];
  }>,
  filter: (
    rows: T[],
    dimension: DashboardSelectionDimension,
    key: string,
  ) => T[],
  build: (currentRows: T[], previousRows: T[]) => DashboardSnapshot,
): Record<string, DashboardSnapshot> {
  const result: Record<string, DashboardSnapshot> = {};

  for (const { dimension, points } of dimensions) {
    for (const point of points) {
      const key = `${dimension}:${point.key}`;

      result[key] = build(
        filter(current, dimension, point.key),
        filter(previous, dimension, point.key),
      );
    }
  }

  return result;
}

export function buildExecutiveDashboard(input: {
  period: DashboardPeriod;
  devolucionesRows: DevolucionFact[];
  cargaRows: CargaFact[];
  includeCarga: boolean;
}): ExecutiveDashboardData {
  const { period, devolucionesRows, cargaRows } = input;

  const devolucionesSplit = splitPeriod(
    devolucionesRows,
    (row) => row.created_at,
    period,
  );

  const devBase = buildDevolucionSnapshot(
    devolucionesSplit.current,
    devolucionesSplit.previous,
    period,
  );

  const devSelections = makeSelectionSnapshots(
    devolucionesSplit.current,
    devolucionesSplit.previous,
    [
      { dimension: "state", points: devBase.states },
      { dimension: "flow", points: devBase.flow },
      { dimension: "material", points: devBase.material },
      { dimension: "article", points: devBase.articles },
      { dimension: "carrier", points: devBase.carriers },
      { dimension: "plate", points: devBase.plates },
    ],
    filterDevoluciones,
    (currentRows, previousRows) =>
      buildDevolucionSnapshot(currentRows, previousRows, period),
  );

  let carga: DashboardModeData | null = null;

  if (input.includeCarga) {
    const cargaSplit = splitPeriod(
      cargaRows,
      (row) => row.recibido_at ?? row.created_at,
      period,
    );

    const cargaBase = buildCargaSnapshot(
      cargaSplit.current,
      cargaSplit.previous,
      period,
    );

    const cargaSelections = makeSelectionSnapshots(
      cargaSplit.current,
      cargaSplit.previous,
      [
        { dimension: "state", points: cargaBase.states },
        { dimension: "physical", points: cargaBase.physical },
        { dimension: "motive", points: cargaBase.motives },
        { dimension: "route", points: cargaBase.routes },
        { dimension: "client", points: cargaBase.clients },
        { dimension: "carrier", points: cargaBase.carriers },
      ],
      filterCarga,
      (currentRows, previousRows) =>
        buildCargaSnapshot(currentRows, previousRows, period),
    );

    carga = {
      mode: "carga",
      title: "Reporte de carga",
      base: cargaBase,
      selections: cargaSelections,
    };
  }

  return {
    period,
    devoluciones: {
      mode: "devoluciones",
      title: "Devoluciones",
      base: devBase,
      selections: devSelections,
    },
    carga,
  };
}
