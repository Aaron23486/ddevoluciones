// Métricas genéricas del dashboard: KPI, conteos, ciclos, antigüedad, tendencias y
// puntos de atención, con sus etiquetas y colores.

import type {
  DashboardAttention,
  DashboardKpi,
  DashboardMetricPoint,
  DashboardPeriod,
  DashboardTrendPoint,
} from "@/types/dashboard";
import { startOfUtcDay, isoDate } from "./dashboard-period";

export const DEV_STATE_COLORS: Record<string, string> = {
  pendiente_entrega: "#60a5fa",
  pendiente_proceso: "#a78bfa",
  recibida_bodega: "#22d3ee",
  pendiente_ubicar: "#fb923c",
  pendiente_disposicion: "#f87171",
  cerrada: "#4ade80",
};

export const LOAD_STATE_COLORS: Record<string, string> = {
  recibido_muelle: "#60a5fa",
  pendiente_redespacho: "#fb923c",
  redespachado: "#4ade80",
};

export const DEV_STATE_LABELS: Record<string, string> = {
  pendiente_entrega: "Pendiente de entrega",
  pendiente_proceso: "Pendiente de proceso",
  recibida_bodega: "Recibida en bodega",
  pendiente_ubicar: "Pendiente de ubicar",
  pendiente_disposicion: "Pendiente de disposicion",
  cerrada: "Cerrada",
};

export const LOAD_STATE_LABELS: Record<string, string> = {
  recibido_muelle: "Recibido en muelle",
  pendiente_redespacho: "Pendiente de envio",
  redespachado: "Enviado",
};

export const GENERIC_COLORS = [
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

export function percentageChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function trendLabel(change: number | null): string {
  if (change === null) return "nuevo";
  if (change === 0) return "sin cambio";
  return `${change > 0 ? "+" : ""}${change}% vs anterior`;
}

export function kpi(
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

export function countBy<T>(
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

export function metricPoints(
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

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  if (hours >= 24) return `${(hours / 24).toFixed(1)} d`;
  return `${hours.toFixed(1)} h`;
}

export function averageCycleHours<T>(
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

export function agingBucket(days: number): string {
  if (days <= 1) return "0-1 dias";
  if (days <= 3) return "2-3 dias";
  if (days <= 7) return "4-7 dias";
  if (days <= 14) return "8-14 dias";
  return "15+ dias";
}

export const AGING_ORDER = [
  "0-1 dias",
  "2-3 dias",
  "4-7 dias",
  "8-14 dias",
  "15+ dias",
];

export function agingPoints<T>(
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

export function bucketKey(date: Date, weekly: boolean): string {
  const value = startOfUtcDay(date);

  if (weekly) {
    const day = value.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    value.setUTCDate(value.getUTCDate() + mondayOffset);
  }

  return isoDate(value);
}

export function buildTrend<T>(
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

export function agedOverSeven<T>(
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

export function makeAttention(
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
