import { describe, expect, it } from "vitest";
import { filterPersonallyClearedNotifications } from "./personal-clear";

const all = [
  { id: "old", created_at: "2026-10-05T10:00:00Z" },
  { id: "boundary", created_at: "2026-10-06T10:00:00Z" },
  { id: "new", created_at: "2026-10-06T10:00:01Z" },
];

describe("limpieza de la bandeja personal", () => {
  it("oculta solo los avisos creados hasta el corte", () => {
    expect(
      filterPersonallyClearedNotifications(all, "2026-10-06T10:00:00Z").map(
        (item) => item.id,
      ),
    ).toEqual(["new"]);
  });

  it("conserva todos los avisos si el corte falta o no es válido", () => {
    expect(filterPersonallyClearedNotifications(all, undefined)).toEqual(all);
    expect(filterPersonallyClearedNotifications(all, "invalid")).toEqual(all);
  });

  it("no modifica la lista recibida", () => {
    const original = [...all];
    filterPersonallyClearedNotifications(all, "2026-10-06T10:00:00Z");
    expect(all).toEqual(original);
  });
});
