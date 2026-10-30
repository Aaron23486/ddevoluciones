"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  resolveDashboardSnapshot,
  toggleDashboardSelection,
} from "@/lib/dashboard-interaction";
import type {
  DashboardMetricPoint,
  DashboardMode,
  DashboardModeData,
  DashboardSelection,
  DashboardSelectionDimension,
  ExecutiveDashboardData,
} from "@/types/dashboard";
import {
  ChartCard,
  KpiGrid,
  DonutChart,
  VerticalMetricBars,
  HorizontalMetricBars,
  TrendChart,
  AttentionPanel,
  EmptyChart,
} from "@/components/dashboard/dashboard-charts";

function drillHref(
  mode: DashboardMode,
  selection: DashboardSelection | null,
): string {
  if (!selection) {
    return mode === "devoluciones" ? "/devoluciones" : "/reportes-carga";
  }

  if (mode === "devoluciones") {
    if (selection.dimension === "state") {
      return `/devoluciones?estado=${encodeURIComponent(selection.key)}`;
    }
    if (selection.dimension === "flow") {
      return `/devoluciones?flujo=${encodeURIComponent(selection.key)}`;
    }
    if (selection.dimension === "material") {
      return `/devoluciones?material=${encodeURIComponent(selection.key)}`;
    }
    if (selection.dimension === "article") {
      return `/devoluciones?search=${encodeURIComponent(selection.key)}`;
    }

    return "/devoluciones";
  }

  if (selection.dimension === "state") {
    return `/reportes-carga?estado=${encodeURIComponent(selection.key)}`;
  }

  if (
    selection.dimension === "route" ||
    selection.dimension === "client" ||
    selection.dimension === "carrier" ||
    selection.dimension === "motive"
  ) {
    return `/reportes-carga?search=${encodeURIComponent(selection.key)}`;
  }

  return "/reportes-carga";
}

export function OperationalDashboard({
  data,
}: {
  data: ExecutiveDashboardData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<DashboardMode>("devoluciones");
  const [selection, setSelection] = useState<DashboardSelection | null>(null);
  const [customFrom, setCustomFrom] = useState(data.period.from);
  const [customTo, setCustomTo] = useState(data.period.to);

  const modeData: DashboardModeData =
    mode === "carga" && data.carga ? data.carga : data.devoluciones;

  const snapshot = useMemo(
    () => resolveDashboardSnapshot(modeData, selection),
    [modeData, selection],
  );

  const base = modeData.base;

  function selectPoint(
    dimension: DashboardSelectionDimension,
    point: DashboardMetricPoint,
  ) {
    setSelection((current) =>
      toggleDashboardSelection(current, {
        dimension,
        key: point.key,
        label: point.label,
        color: point.color,
      }),
    );
  }

  function setPeriod(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", String(days));
    params.delete("from");
    params.delete("to");
    router.replace(`/dashboard?${params.toString()}`);
  }

  function applyCustomPeriod() {
    if (!customFrom || !customTo) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("days");
    params.set("from", customFrom);
    params.set("to", customTo);
    router.replace(`/dashboard?${params.toString()}`);
  }

  function switchMode(next: DashboardMode) {
    if (next === "carga" && !data.carga) return;
    setMode(next);
    setSelection(null);
  }

  const stateData =
    selection?.dimension === "state" ? base.states : snapshot.states;

  const flowData = selection?.dimension === "flow" ? base.flow : snapshot.flow;

  const materialData =
    selection?.dimension === "material" ? base.material : snapshot.material;

  const motiveData =
    selection?.dimension === "motive" ? base.motives : snapshot.motives;

  const routeData =
    selection?.dimension === "route" ? base.routes : snapshot.routes;

  const clientData =
    selection?.dimension === "client" ? base.clients : snapshot.clients;

  const physicalData =
    selection?.dimension === "physical" ? base.physical : snapshot.physical;

  const articleData =
    selection?.dimension === "article" ? base.articles : snapshot.articles;

  return (
    <main className="od-page">
      <section className="od-header dv-glass">
        <div>
          <span className="od-eyebrow">Business Intelligence Operativo</span>
          <h1>Dashboard</h1>
          <p>
            Lectura operacional para detectar volumen, backlog, tendencias,
            envejecimiento y puntos de atencion.
          </p>
        </div>

        <div className="od-period-filter-card">
          <div className="od-period-filter-heading">
            <span>Periodo</span>
            <strong>Filtrar analitica</strong>
          </div>

          <div className="od-period-filter-fields">
            <label>
              <span>Desde</span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>

            <label>
              <span>Hasta</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>

            <button type="button" onClick={applyCustomPeriod}>
              Aplicar
            </button>
          </div>
        </div>
      </section>

      <section className="od-control-bar dv-glass">
        <div className="od-mode-tabs" role="tablist" aria-label="Operacion">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "devoluciones"}
            className={mode === "devoluciones" ? "active" : ""}
            onClick={() => switchMode("devoluciones")}
          >
            Devoluciones
          </button>

          {data.carga ? (
            <button
              type="button"
              role="tab"
              aria-selected={mode === "carga"}
              className={mode === "carga" ? "active" : ""}
              onClick={() => switchMode("carga")}
            >
              Reporte de carga
            </button>
          ) : null}
        </div>

        <div className="od-period-controls">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              className={
                data.period.days === days && !searchParams.has("from")
                  ? "active"
                  : ""
              }
              onClick={() => setPeriod(days)}
            >
              {days} dias
            </button>
          ))}
        </div>
      </section>

      {selection ? (
        <section className="od-active-filter">
          <div>
            <i style={{ background: selection.color }} />
            <span>Filtro activo</span>
            <strong>{selection.label}</strong>
          </div>

          <div>
            <Link href={drillHref(mode, selection)}>Ver casos</Link>
            <button type="button" onClick={() => setSelection(null)}>
              Limpiar seleccion
            </button>
          </div>
        </section>
      ) : null}

      <KpiGrid snapshot={snapshot} />

      <section className="od-grid od-grid-primary">
        <ChartCard eyebrow="Distribucion" title="Estado de la operacion">
          {stateData.length > 0 ? (
            <DonutChart
              data={snapshot.states}
              baseData={base.states}
              dimension="state"
              selection={selection}
              onSelect={selectPoint}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard eyebrow="Tendencia" title="Entradas vs resoluciones">
          {snapshot.trend.length > 0 ? (
            <TrendChart snapshot={snapshot} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </section>

      <section className="od-grid od-grid-secondary">
        <ChartCard eyebrow="Backlog" title="Antiguedad de casos abiertos">
          {snapshot.aging.length > 0 ? (
            <VerticalMetricBars
              data={snapshot.aging}
              baseData={base.aging}
              dimension="state"
              selection={null}
              onSelect={() => undefined}
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {mode === "devoluciones" ? (
          <ChartCard eyebrow="Flujo" title="Carga por flujo operativo">
            {flowData.length > 0 ? (
              <HorizontalMetricBars
                data={snapshot.flow}
                baseData={base.flow}
                dimension="flow"
                selection={selection}
                onSelect={selectPoint}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        ) : (
          <ChartCard eyebrow="Motivos" title="Principales motivos de retorno">
            {motiveData.length > 0 ? (
              <HorizontalMetricBars
                data={snapshot.motives}
                baseData={base.motives}
                dimension="motive"
                selection={selection}
                onSelect={selectPoint}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        )}
      </section>

      <section className="od-grid od-grid-secondary">
        {mode === "devoluciones" ? (
          <ChartCard eyebrow="Material" title="Condicion del material">
            {materialData.length > 0 ? (
              <DonutChart
                data={snapshot.material}
                baseData={base.material}
                dimension="material"
                selection={selection}
                onSelect={selectPoint}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        ) : (
          <ChartCard eyebrow="Estado fisico" title="Condicion de la carga">
            {physicalData.length > 0 ? (
              <DonutChart
                data={snapshot.physical}
                baseData={base.physical}
                dimension="physical"
                selection={selection}
                onSelect={selectPoint}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        )}

        {mode === "devoluciones" ? (
          <ChartCard eyebrow="Ranking" title="Articulos con mas devoluciones">
            {articleData.length > 0 ? (
              <HorizontalMetricBars
                data={snapshot.articles}
                baseData={base.articles}
                dimension="article"
                selection={selection}
                onSelect={selectPoint}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        ) : (
          <ChartCard
            eyebrow="Rutas"
            title="Rutas con mayor volumen de retornos"
          >
            {routeData.length > 0 ? (
              <HorizontalMetricBars
                data={snapshot.routes}
                baseData={base.routes}
                dimension="route"
                selection={selection}
                onSelect={selectPoint}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        )}
      </section>

      {mode === "carga" ? (
        <section className="od-grid od-grid-secondary">
          <ChartCard eyebrow="Clientes" title="Clientes con mas retornos">
            {clientData.length > 0 ? (
              <HorizontalMetricBars
                data={snapshot.clients}
                baseData={base.clients}
                dimension="client"
                selection={selection}
                onSelect={selectPoint}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>

          <ChartCard
            eyebrow="Transportistas"
            title="Mayor volumen de retornos registrados"
          >
            {snapshot.carriers.length > 0 ? (
              <HorizontalMetricBars
                data={snapshot.carriers}
                baseData={base.carriers}
                dimension="carrier"
                selection={selection}
                onSelect={selectPoint}
              />
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        </section>
      ) : null}

      <section className="od-grid od-grid-final">
        <ChartCard eyebrow="Decision" title="Atencion operativa">
          <AttentionPanel snapshot={snapshot} />
        </ChartCard>

        <article className="od-decision-card dv-glass">
          <span className="od-eyebrow">Siguiente paso</span>
          <h2>Explorar la operacion</h2>
          <p>
            Usa cualquier segmento o barra para aplicar cross-highlighting. Las
            visualizaciones compatibles se recalculan con ese subconjunto.
          </p>

          <Link href={drillHref(mode, selection)}>Abrir casos operativos</Link>
        </article>
      </section>
    </main>
  );
}
