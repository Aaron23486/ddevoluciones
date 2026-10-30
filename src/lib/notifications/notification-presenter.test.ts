import { describe, expect, it } from "vitest";
import {
  formatNotificationDate,
  humanNotificationMessage,
  humanNotificationTitle,
} from "./notification-presenter";

describe("presentación de notificaciones (contrato)", () => {
  it("nunca muestra nombres técnicos de eventos como título", () => {
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

  it("usa un título legible para eventos desconocidos", () => {
    expect(
      humanNotificationTitle({
        event_type: "future_event",
        title: "Actualizacion operacional",
      }),
    ).toBe("Actualizacion operacional");
  });

  it("formatea fechas para Costa Rica", () => {
    const formatted = formatNotificationDate("2026-10-06T23:42:00.000Z");
    expect(formatted).toContain("2026");
  });

  it("usa un mensaje legible por defecto", () => {
    expect(humanNotificationMessage({ message: "" })).toContain(
      "actualizacion",
    );
  });
});
