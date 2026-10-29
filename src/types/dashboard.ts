export type DashboardMode = "devoluciones" | "carga";

export type DashboardSelectionDimension =
  | "state"
  | "flow"
  | "material"
  | "article"
  | "carrier"
  | "plate"
  | "route"
  | "client"
  | "physical"
  | "motive";

export type DashboardSelection = {
  dimension: DashboardSelectionDimension;
  key: string;
  label: string;
  color: string;
};

export type DashboardMetricPoint = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type DashboardTrendPoint = {
  key: string;
  label: string;
  entries: number;
  resolved: number;
};

export type DashboardKpi = {
  key: string;
  label: string;
  value: string;
  rawValue: number;
  change: number | null;
  changeLabel: string;
  tone: "blue" | "violet" | "cyan" | "orange" | "red" | "green";
};

export type DashboardAttention = {
  tone: "warning" | "positive" | "neutral";
  title: string;
  message: string;
};

export type DashboardSnapshot = {
  kpis: DashboardKpi[];
  states: DashboardMetricPoint[];
  trend: DashboardTrendPoint[];
  aging: DashboardMetricPoint[];
  flow: DashboardMetricPoint[];
  material: DashboardMetricPoint[];
  physical: DashboardMetricPoint[];
  motives: DashboardMetricPoint[];
  articles: DashboardMetricPoint[];
  carriers: DashboardMetricPoint[];
  plates: DashboardMetricPoint[];
  routes: DashboardMetricPoint[];
  clients: DashboardMetricPoint[];
  attention: DashboardAttention[];
  total: number;
};

export type DashboardModeData = {
  mode: DashboardMode;
  title: string;
  base: DashboardSnapshot;
  selections: Record<string, DashboardSnapshot>;
};

export type DashboardPeriod = {
  key: string;
  label: string;
  days: number;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
};

export type ExecutiveDashboardData = {
  period: DashboardPeriod;
  devoluciones: DashboardModeData;
  carga: DashboardModeData | null;
};
