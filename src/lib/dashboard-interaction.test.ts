import { describe, expect, it } from "vitest";
import {
  dashboardPointOpacity,
  resolveDashboardSnapshot,
  toggleDashboardSelection,
} from "@/lib/dashboard-interaction";
import type {
  DashboardModeData,
  DashboardSelection,
  DashboardSnapshot,
} from "@/types/dashboard";

function emptySnapshot(total: number): DashboardSnapshot {
  return {
    kpis: [],
    states: [],
    trend: [],
    aging: [],
    flow: [],
    material: [],
    physical: [],
    motives: [],
    articles: [],
    carriers: [],
    plates: [],
    routes: [],
    clients: [],
    attention: [],
    total,
  };
}

describe("resaltado cruzado del dashboard", () => {
  const stateSelection: DashboardSelection = {
    dimension: "state",
    key: "pendiente_ubicar",
    label: "Pendiente de ubicar",
    color: "#fb923c",
  };

  const modeData: DashboardModeData = {
    mode: "devoluciones",
    title: "Devoluciones",
    base: emptySnapshot(100),
    selections: {
      "state:pendiente_ubicar": emptySnapshot(22),
    },
  };

  it("resuelve el snapshot filtrado cuando existe una seleccion", () => {
    expect(resolveDashboardSnapshot(modeData, stateSelection).total).toBe(22);
  });

  it("vuelve al snapshot base sin seleccion", () => {
    expect(resolveDashboardSnapshot(modeData, null).total).toBe(100);
  });

  it("un segundo toque sobre la misma seleccion la limpia", () => {
    expect(toggleDashboardSelection(stateSelection, stateSelection)).toBeNull();
  });

  it("atenua elementos hermanos pero conserva el seleccionado", () => {
    expect(
      dashboardPointOpacity(stateSelection, "state", "pendiente_ubicar"),
    ).toBe(1);

    expect(dashboardPointOpacity(stateSelection, "state", "cerrada")).toBe(
      0.32,
    );

    expect(dashboardPointOpacity(stateSelection, "flow", "pesado")).toBe(1);
  });
});
