import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  DashboardAttention,
  DashboardKpi,
  DashboardMetricPoint,
  DashboardModeData,
  DashboardPeriod,
  DashboardSelectionDimension,
  DashboardSnapshot,
  DashboardTrendPoint,
  ExecutiveDashboardData,
} from "@/types/dashboard";

type DevolucionFact = {
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

type CargaFact = {
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

const DEV_STATE_COLORS: Record<string, string> = {
  pendiente_entrega: "#60a5fa",
  pendiente_proceso: "#a78bfa",
  recibida_bodega: "#22d3ee",
  pendiente_ubicar: "#fb923c",
  pendiente_disposicion: "#f87171",
  cerrada: "#4ade80",
};

const LOAD_STATE_COLORS: Record<string, string> = {
  recibido_muelle: "#60a5fa",
  pendiente_redespacho: "#fb923c",
  redespachado: "#4ade80",
};

const DEV_STATE_LABELS: Record<string, string> = {
  pendiente_entrega: "Pendiente de entrega",
  pendiente_proceso: "Pendiente de proceso",
  recibida_bodega: "Recibida en bodega",
  pendiente_ubicar: "Pendiente de ubicar",
  pendiente_disposicion: "Pendiente de disposicion",
  cerrada: "Cerrada",
};

const LOAD_STATE_LABELS: Record<string, string> = {
  recibido_muelle: "Recibido en muelle",
  pendiente_redespacho: "Pendiente de envio",
  redespachado: "Enviado",
};

const GENERIC_COLORS = [
  "#a78bfa",
  "#60a5fa",
  "#22d3ee",
  "#4ade80",
  "#fb923c",
  "#f87171",
  "#c084fc",
  "#38bdf8",
  "#34d399",
  "#fbbf24",
];

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function validDateOnly(value?: string): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolvePeriod(input: {
  days?: number;
  from?: string;
  to?: string;
}): DashboardPeriod {
  let to = endOfUtcDay(new Date());
  let from: Date;

  if (validDateOnly(input.from) && validDateOnly(input.to)) {
    const customFrom = startOfUtcDay(new Date(`${input.from}T00:00:00.000Z`));
    const customTo = endOfUtcDay(new Date(`${input.to}T00:00:00.000Z`));

    if (customFrom <= customTo) {
      from = customFrom;
      to = customTo;
    } else {
      const days = [7, 30, 90].includes(input.days ?? 30)
        ? (input.days ?? 30)
        : 30;
      from = startOfUtcDay(addDays(to, -(days - 1)));
    }
  } else {
    const days = [7, 30, 90].includes(input.days ?? 30)
      ? (input.days ?? 30)
      : 30;

    from = startOfUtcDay(addDays(to, -(days - 1)));
  }

  const lengthDays =
    Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;

  const previousTo = endOfUtcDay(addDays(from, -1));
  const previousFrom = startOfUtcDay(addDays(previousTo, -(lengthDays - 1)));

  return {
    key: `${isoDate(from)}_${isoDate(to)}`,
    label: `${isoDate(from)} - ${isoDate(to)}`,
    days: lengthDays,
    from: isoDate(from),
    to: isoDate(to),
    previousFrom: isoDate(previousFrom),
    previousTo: isoDate(previousTo),
  };
}

function between(value: string | null, from: Date, to: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= from.getTime() && time <= to.getTime();
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function trendLabel(change: number | null): string {
  if (change === null) return "nuevo";
  if (change === 0) return "sin cambio";
  return `${change > 0 ? "+" : ""}${change}% vs anterior`;
}

function kpi(
  key: string,
  label: string,
  rawValue: number,
  previous: number,
  value: string,
  tone: DashboardKpi["tone"],
): DashboardKpi {
  const change = percentageChange(rawValue, previous);

  return {
    key,
    label,
    value,
    rawValue,
    change,
    changeLabel: trendLabel(change),
    tone,
  };
}

function countBy<T>(
  rows: T[],
  getter: (row: T) => string | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of rows) {
    const raw = getter(row)?.trim();
    if (!raw) continue;
    map.set(raw, (map.get(raw) ?? 0) + 1);
  }

  return map;
}

function metricPoints(
  map: Map<string, number>,
  labels: Record<string, string> = {},
  colors: Record<string, string> = {},
  limit = 10,
): DashboardMetricPoint[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value], index) => ({
      key,
      label: labels[key] ?? key,
      value,
      color: colors[key] ?? GENERIC_COLORS[index % GENERIC_COLORS.length],
    }));
}

function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  if (hours >= 24) return `${(hours / 24).toFixed(1)} d`;
  return `${hours.toFixed(1)} h`;
}

function averageCycleHours<T>(
  rows: T[],
  start: (row: T) => string | null,
  end: (row: T) => string | null,
): number {
  const values: number[] = [];

  for (const row of rows) {
    const startValue = start(row);
    const endValue = end(row);

    if (!startValue || !endValue) continue;

    const hours =
      (new Date(endValue).getTime() - new Date(startValue).getTime()) /
      3_600_000;

    if (Number.isFinite(hours) && hours >= 0) values.push(hours);
  }

  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function agingBucket(days: number): string {
  if (days <= 1) return "0-1 dias";
  if (days <= 3) return "2-3 dias";
  if (days <= 7) return "4-7 dias";
  if (days <= 14) return "8-14 dias";
  return "15+ dias";
}

const AGING_ORDER = [
  "0-1 dias",
  "2-3 dias",
  "4-7 dias",
  "8-14 dias",
  "15+ dias",
];

function agingPoints<T>(
  rows: T[],
  isOpen: (row: T) => boolean,
  dateGetter: (row: T) => string,
): DashboardMetricPoint[] {
  const map = new Map<string, number>(AGING_ORDER.map((key) => [key, 0]));

  const now = Date.now();

  for (const row of rows) {
    if (!isOpen(row)) continue;

    const age = Math.max(
      0,
      Math.floor((now - new Date(dateGetter(row)).getTime()) / 86_400_000),
    );

    const key = agingBucket(age);
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return AGING_ORDER.map((key, index) => ({
    key,
    label: key,
    value: map.get(key) ?? 0,
    color: GENERIC_COLORS[index % GENERIC_COLORS.length],
  }));
}

function bucketKey(date: Date, weekly: boolean): string {
  const value = startOfUtcDay(date);

  if (weekly) {
    const day = value.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    value.setUTCDate(value.getUTCDate() + mondayOffset);
  }

  return isoDate(value);
}

function buildTrend<T>(
  rows: T[],
  period: DashboardPeriod,
  entryDate: (row: T) => string,
  resolvedDate: (row: T) => string | null,
): DashboardTrendPoint[] {
  const weekly = period.days > 45;
  const map = new Map<string, { entries: number; resolved: number }>();

  for (const row of rows) {
    const entryKey = bucketKey(new Date(entryDate(row)), weekly);
    const entry = map.get(entryKey) ?? { entries: 0, resolved: 0 };
    entry.entries += 1;
    map.set(entryKey, entry);

    const resolved = resolvedDate(row);
    if (resolved) {
      const resolvedKey = bucketKey(new Date(resolved), weekly);
      const resolvedPoint = map.get(resolvedKey) ?? { entries: 0, resolved: 0 };
      resolvedPoint.resolved += 1;
      map.set(resolvedKey, resolvedPoint);
    }
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({
      key,
      label: key.slice(5),
      entries: value.entries,
      resolved: value.resolved,
    }));
}

function agedOverSeven<T>(
  rows: T[],
  isOpen: (row: T) => boolean,
  dateGetter: (row: T) => string,
): number {
  const now = Date.now();

  return rows.filter((row) => {
    if (!isOpen(row)) return false;

    return (now - new Date(dateGetter(row)).getTime()) / 86_400_000 > 7;
  }).length;
}

function makeAttention(
  aged: number,
  bottleneck: DashboardMetricPoint | undefined,
  openChange: number | null,
  resolvedChange: number | null,
): DashboardAttention[] {
  const items: DashboardAttention[] = [];

  if (aged > 0) {
    items.push({
      tone: "warning",
      title: "Casos envejecidos",
      message: `${aged} casos llevan mas de 7 dias abiertos.`,
    });
  }

  if (bottleneck && bottleneck.value > 0) {
    items.push({
      tone: "warning",
      title: "Mayor concentracion",
      message: `${bottleneck.label} concentra ${bottleneck.value} casos.`,
    });
  }

  if (openChange !== null && openChange >= 15) {
    items.push({
      tone: "warning",
      title: "Backlog en crecimiento",
      message: `Los casos abiertos aumentaron ${openChange}% frente al periodo anterior.`,
    });
  }

  if (resolvedChange !== null && resolvedChange > 0) {
    items.push({
      tone: "positive",
      title: "Resolucion mejora",
      message: `Los cierres/salidas aumentaron ${resolvedChange}% frente al periodo anterior.`,
    });
  }

  if (items.length === 0) {
    items.push({
      tone: "neutral",
      title: "Operacion estable",
      message: "No se detectan alertas relevantes con las reglas actuales.",
    });
  }

  return items.slice(0, 4);
}

function filterDevoluciones(
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

function filterCarga(
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

function buildDevolucionSnapshot(
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

function buildCargaSnapshot(
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

function makeSelectionSnapshots<T>(
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

async function fetchAllDevoluciones(
  combinedFrom: string,
  combinedToExclusive: string,
): Promise<DevolucionFact[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const rows: DevolucionFact[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("devoluciones")
      .select(
        "id,factura,articulo,cantidad,estado_material,transportista_nombre,placa_camion,estado,created_at,cerrado_at,flujo_inicial",
      )
      .gte("created_at", combinedFrom)
      .lt("created_at", combinedToExclusive)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as DevolucionFact[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchAllCarga(
  combinedFrom: string,
  combinedToExclusive: string,
): Promise<CargaFact[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const rows: CargaFact[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("reportes_carga")
      .select(
        "id,numero_documento,factura,cliente,articulo,cantidad,transportista,ruta,placa,motivo_no_entrega,estado_fisico_carga,estado,recibido_at,redespachado_at,created_at",
      )
      .eq("is_active", true)
      .gte("created_at", combinedFrom)
      .lt("created_at", combinedToExclusive)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as CargaFact[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

function splitPeriod<T>(
  rows: T[],
  dateGetter: (row: T) => string,
  period: DashboardPeriod,
): { current: T[]; previous: T[] } {
  const currentFrom = startOfUtcDay(new Date(`${period.from}T00:00:00.000Z`));
  const currentTo = endOfUtcDay(new Date(`${period.to}T00:00:00.000Z`));
  const previousFrom = startOfUtcDay(
    new Date(`${period.previousFrom}T00:00:00.000Z`),
  );
  const previousTo = endOfUtcDay(
    new Date(`${period.previousTo}T00:00:00.000Z`),
  );

  return {
    current: rows.filter((row) =>
      between(dateGetter(row), currentFrom, currentTo),
    ),
    previous: rows.filter((row) =>
      between(dateGetter(row), previousFrom, previousTo),
    ),
  };
}

export async function getExecutiveDashboardData(input: {
  days?: number;
  from?: string;
  to?: string;
  includeCarga: boolean;
}): Promise<ExecutiveDashboardData> {
  const period = resolvePeriod(input);

  const combinedFrom = `${period.previousFrom}T00:00:00.000Z`;
  const combinedToExclusive = `${isoDate(addDays(new Date(`${period.to}T00:00:00.000Z`), 1))}T00:00:00.000Z`;

  const [devolucionesRows, cargaRows] = await Promise.all([
    fetchAllDevoluciones(combinedFrom, combinedToExclusive),
    input.includeCarga
      ? fetchAllCarga(combinedFrom, combinedToExclusive)
      : Promise.resolve([]),
  ]);

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
