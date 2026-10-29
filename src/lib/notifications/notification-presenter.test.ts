import { describe, expect, it } from "vitest";
import {
  formatNotificationDate,
  humanNotificationMessage,
  humanNotificationTitle,
} from "./notification-presenter";

describe("notification presenter", () => {
  it("never exposes known technical event names as the visible title", () => {
    expect(
      humanNotificationTitle({
        event_type: "reporte_carga_enviado",
        title: "Carga enviada",
      }),
    ).toBe("Carga enviada");

    expect(
      humanNotificationTitle({
        event_type: "pendiente_ubicar",
        title: "Material pendiente",
      }),
    ).toBe("Material pendiente de ubicacion");
  });

  it("keeps a safe human fallback for unknown events", () => {
    expect(
      humanNotificationTitle({
        event_type: "future_event",
        title: "Actualizacion operacional",
      }),
    ).toBe("Actualizacion operacional");
  });

  it("formats dates for Costa Rica", () => {
    const formatted = formatNotificationDate("2026-10-06T23:42:00.000Z");
    expect(formatted).toContain("2026");
  });

  it("uses a readable fallback message", () => {
    expect(humanNotificationMessage({ message: "" })).toContain(
      "actualizacion",
    );
  });
});
