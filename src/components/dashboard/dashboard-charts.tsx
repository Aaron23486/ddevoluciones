"use client";

// Gráficos y paneles del dashboard operativo (Recharts). Reciben los datos ya calculados.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dashboardPointOpacity } from "@/lib/dashboard-interaction";
import type {
  DashboardMetricPoint,
  DashboardSelection,
  DashboardSelectionDimension,
  DashboardSnapshot,
} from "@/types/dashboard";

export const TOOLTIP_STYLE = {
  background: "rgba(18, 13, 27, 0.97)",
  border: "1px solid rgba(167, 139, 250, 0.2)",
  borderRadius: "12px",
  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.36)",
  color: "#f8f5ff",
  fontSize: "12px",
};

export function ChartCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="od-chart-card dv-glass">
      <header>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </article>
  );
}

export function KpiGrid({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <section className="od-kpi-grid">
      {snapshot.kpis.map((item) => {
        const direction =
          item.change === null
            ? "neutral"
            : item.change > 0
              ? "up"
              : item.change < 0
                ? "down"
                : "neutral";

        return (
          <article
            key={item.key}
            className={`od-kpi od-tone-${item.tone} dv-glass`}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small className={`od-trend-${direction}`}>
              {item.changeLabel}
            </small>
          </article>
        );
      })}
    </section>
  );
}

export function SelectionLegend({
  data,
  dimension,
  selection,
  onSelect,
}: {
  data: DashboardMetricPoint[];
  dimension: DashboardSelectionDimension;
  selection: DashboardSelection | null;
  onSelect: (
    dimension: DashboardSelectionDimension,
    point: DashboardMetricPoint,
  ) => void;
}) {
  return (
    <div className="od-legend">
      {data.map((item) => (
        <button
          key={item.key}
          type="button"
          className={
            selection?.dimension === dimension && selection.key === item.key
              ? "active"
              : ""
          }
          onClick={() => onSelect(dimension, item)}
        >
          <i style={{ background: item.color }} />
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </button>
      ))}
    </div>
  );
}

export function DonutChart({
  data,
  baseData,
  dimension,
  selection,
  onSelect,
}: {
  data: DashboardMetricPoint[];
  baseData: DashboardMetricPoint[];
  dimension: DashboardSelectionDimension;
  selection: DashboardSelection | null;
  onSelect: (
    dimension: DashboardSelectionDimension,
    point: DashboardMetricPoint,
  ) => void;
}) {
  const shown = selection?.dimension === dimension ? baseData : data;

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <>
      <div className="od-donut-wrap od-chart-interactive">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius={72}
              outerRadius={104}
              paddingAngle={3}
              stroke="rgba(255,255,255,0.03)"
              strokeWidth={1}
            >
              {shown.map((item) => (
                <Cell
                  key={item.key}
                  fill={item.color}
                  fillOpacity={dashboardPointOpacity(
                    selection,
                    dimension,
                    item.key,
                  )}
                  onClick={() => onSelect(dimension, item)}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                `${String(value)} casos`,
                String(name) === "value" ? "Cantidad" : String(name),
              ]}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "#cfc2ff" }}
              itemStyle={{ color: "#f8f5ff" }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="od-donut-total" aria-hidden="true">
          <strong>{total}</strong>
          <span>casos</span>
        </div>
      </div>

      <SelectionLegend
        data={shown}
        dimension={dimension}
        selection={selection}
        onSelect={onSelect}
      />
    </>
  );
}

export function VerticalMetricBars({
  data,
  baseData,
  dimension,
  selection,
  onSelect,
}: {
  data: DashboardMetricPoint[];
  baseData: DashboardMetricPoint[];
  dimension: DashboardSelectionDimension;
  selection: DashboardSelection | null;
  onSelect: (
    dimension: DashboardSelectionDimension,
    point: DashboardMetricPoint,
  ) => void;
}) {
  const shown = selection?.dimension === dimension ? baseData : data;

  return (
    <div className="od-chart-interactive">
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={shown}>
          <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "rgba(239,233,255,.58)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fill: "rgba(239,233,255,.48)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value, name) => [
              `${String(value)} casos`,
              String(name) === "value" ? "Cantidad" : String(name),
            ]}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(167,139,250,.04)" }}
          />
          <Bar dataKey="value" radius={[8, 8, 2, 2]}>
            {shown.map((item) => (
              <Cell
                key={item.key}
                fill={item.color}
                fillOpacity={dashboardPointOpacity(
                  selection,
                  dimension,
                  item.key,
                )}
                onClick={() => onSelect(dimension, item)}
                style={{ cursor: "pointer" }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalMetricBars({
  data,
  baseData,
  dimension,
  selection,
  onSelect,
  height = 280,
}: {
  data: DashboardMetricPoint[];
  baseData: DashboardMetricPoint[];
  dimension: DashboardSelectionDimension;
  selection: DashboardSelection | null;
  onSelect: (
    dimension: DashboardSelectionDimension,
    point: DashboardMetricPoint,
  ) => void;
  height?: number;
}) {
  const shown = selection?.dimension === dimension ? baseData : data;

  return (
    <div className="od-chart-interactive">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={shown} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.045)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "rgba(239,233,255,.48)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={118}
            tick={{ fill: "rgba(239,233,255,.68)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value, name) => [
              `${String(value)} casos`,
              String(name) === "value" ? "Cantidad" : String(name),
            ]}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "rgba(167,139,250,.04)" }}
          />
          <Bar dataKey="value" radius={[0, 9, 9, 0]}>
            {shown.map((item) => (
              <Cell
                key={item.key}
                fill={item.color}
                fillOpacity={dashboardPointOpacity(
                  selection,
                  dimension,
                  item.key,
                )}
                onClick={() => onSelect(dimension, item)}
                style={{ cursor: "pointer" }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <div className="od-chart-interactive">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={snapshot.trend}>
          <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "rgba(239,233,255,.52)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(239,233,255,.48)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value, name) => [
              `${String(value)} casos`,
              String(name) === "value" ? "Cantidad" : String(name),
            ]}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: "rgba(167,139,250,.18)" }}
          />
          <Line
            type="monotone"
            dataKey="entries"
            name="Entradas"
            stroke="#60a5fa"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="resolved"
            name="Resueltos"
            stroke="#4ade80"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="od-line-legend">
        <span>
          <i className="blue" />
          Entradas
        </span>
        <span>
          <i className="green" />
          Resueltos / salidas
        </span>
      </div>
    </div>
  );
}

export function AttentionPanel({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <div className="od-attention-list">
      {snapshot.attention.map((item, index) => (
        <article key={`${item.title}-${index}`} className={`tone-${item.tone}`}>
          <i />
          <div>
            <strong>{item.title}</strong>
            <p>{item.message}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function EmptyChart() {
  return (
    <div className="od-empty">
      Sin datos para el periodo o filtro seleccionado.
    </div>
  );
}
