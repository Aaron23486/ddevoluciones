import type {
  DashboardModeData,
  DashboardSelection,
  DashboardSnapshot,
} from "@/types/dashboard";

export function dashboardSelectionKey(selection: DashboardSelection): string {
  return `${selection.dimension}:${selection.key}`;
}

export function resolveDashboardSnapshot(
  modeData: DashboardModeData,
  selection: DashboardSelection | null,
): DashboardSnapshot {
  if (!selection) return modeData.base;

  return modeData.selections[dashboardSelectionKey(selection)] ?? modeData.base;
}

export function toggleDashboardSelection(
  current: DashboardSelection | null,
  next: DashboardSelection,
): DashboardSelection | null {
  if (current?.dimension === next.dimension && current.key === next.key) {
    return null;
  }

  return next;
}

export function dashboardPointOpacity(
  active: DashboardSelection | null,
  dimension: DashboardSelection["dimension"],
  key: string,
): number {
  if (!active || active.dimension !== dimension) return 1;
  return active.key === key ? 1 : 0.32;
}
