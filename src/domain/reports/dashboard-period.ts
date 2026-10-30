// Periodos del dashboard: rango actual y anterior, días UTC y filtro por fecha.

import type { DashboardPeriod } from "@/types/dashboard";

export function startOfUtcDay(date: Date): Date {
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

export function endOfUtcDay(date: Date): Date {
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

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function validDateOnly(value?: string): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function resolvePeriod(input: {
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

export function between(value: string | null, from: Date, to: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= from.getTime() && time <= to.getTime();
}

export function splitPeriod<T>(
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
