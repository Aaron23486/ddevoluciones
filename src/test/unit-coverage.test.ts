import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getDefaultRoute } from "@/constants/permissions";
import { isUserRole } from "@/constants/roles";
import { deriveParentState } from "@/domain/devoluciones/state-machine";
import {
  formatNotificationDate,
  humanNotificationMessage,
  humanNotificationTitle,
} from "@/lib/notifications/notification-presenter";
import {
  createDevolucionSchema,
  dispositionSchema,
  inventorySchema,
  locationSchema,
  receptionSchema,
} from "@/schemas/devoluciones";
import {
  assertEvidenceFile,
  removeEvidencePaths,
  uploadEvidence,
} from "@/services/evidence-storage";

const UUID = "4b7d8f0e-2a1c-4e5b-9f6a-1c2d3e4f5a6b";

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], "evidencia", { type });
}

describe("roles y rutas", () => {
  it("reconoce solo los siete roles definidos", () => {
    expect(isUserRole("almacen")).toBe(true);
    expect(isUserRole("jefe")).toBe(false);
    expect(isUserRole(7)).toBe(false);
  });

  it("cada rol tiene una ruta inicial", () => {
    expect(getDefaultRoute("transportes")).toBe("/reportes-carga");
    expect(getDefaultRoute("admin")).toBe("/dashboard");
  });
});

describe("estado del padre", () => {
  it("sin materiales todavía no hay estado derivado", () => {
    expect(deriveParentState([])).toBeNull();
  });

  it("no deriva estado si ningún material espera acción conocida", () => {
    expect(
      deriveParentState([
        { tipo_material: "malo", estado: "pendiente_ubicar" },
        { tipo_material: "bueno", estado: "cerrada" },
      ]),
    ).toBeNull();
  });
});

describe("esquemas de devoluciones", () => {
  const nueva = {
    factura: " F-1 ",
    articulo: "Cocina",
    cantidad: "3",
    clasificacion: "mixto",
    descripcion: "Golpe en la puerta",
    flujo: "pesado",
    transportistaNombre: "Ana",
    transportistaCedula: "1-1111-1111",
    placaCamion: "AB-123",
  };

  it("valida y normaliza el registro de una devolución", () => {
    const parsed = createDevolucionSchema.parse(nueva);
    expect(parsed.factura).toBe("F-1");
    expect(parsed.cantidad).toBe(3);
    expect(
      createDevolucionSchema.safeParse({ ...nueva, flujo: "otro" }).success,
    ).toBe(false);
    expect(
      createDevolucionSchema.safeParse({ ...nueva, cantidad: "0" }).success,
    ).toBe(false);
  });

  it("en una recepción mixta exige que bueno + malo sumen lo recibido", () => {
    const base = {
      devolucionId: UUID,
      cantidadRecibida: "4",
      clasificacion: "mixto",
    };
    expect(
      receptionSchema.safeParse({
        ...base,
        cantidadBueno: "1",
        cantidadMalo: "3",
      }).success,
    ).toBe(true);
    expect(
      receptionSchema.safeParse({
        ...base,
        cantidadBueno: "1",
        cantidadMalo: "1",
      }).success,
    ).toBe(false);
    expect(
      receptionSchema.safeParse({
        ...base,
        cantidadBueno: "",
        cantidadMalo: "",
      }).success,
    ).toBe(false);
  });

  it("una recepción no mixta no necesita cantidades por tipo", () => {
    expect(
      receptionSchema.safeParse({
        devolucionId: UUID,
        cantidadRecibida: "2",
        clasificacion: "bueno",
        cantidadBueno: null,
      }).success,
    ).toBe(true);
  });

  it("valida inventario, ubicación y disposición", () => {
    expect(
      inventorySchema.safeParse({ devolucionId: UUID, palletCodigo: "PAL-1" })
        .success,
    ).toBe(true);
    expect(
      inventorySchema.safeParse({ devolucionId: "x", palletCodigo: "PAL-1" })
        .success,
    ).toBe(false);
    expect(
      locationSchema.safeParse({ materialId: UUID, ubicacion: "A-1" }).success,
    ).toBe(true);
    expect(
      dispositionSchema.safeParse({
        materialId: UUID,
        decisionFinal: "Destruccion",
        observaciones: "",
      }).success,
    ).toBe(false);
  });
});

describe("evidencias", () => {
  it("acepta JPEG, PNG y WebP de hasta 5 MB", () => {
    expect(assertEvidenceFile(file("image/png", 10), "Factura")).toBeInstanceOf(
      File,
    );
    expect(() =>
      assertEvidenceFile(file("application/pdf", 10), "Factura"),
    ).toThrow("formato no permitido");
    expect(() =>
      assertEvidenceFile(file("image/jpeg", 5 * 1024 * 1024 + 1), "Factura"),
    ).toThrow("maximo 5 MB");
  });

  it("distingue evidencias obligatorias de opcionales", () => {
    expect(() => assertEvidenceFile(null, "Factura")).toThrow(
      "archivo requerido",
    );
    expect(
      assertEvidenceFile(file("image/png", 0), "Material", false),
    ).toBeNull();
  });

  it("sube la evidencia a la carpeta del usuario sin sobrescribir", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const client = {
      storage: { from: vi.fn(() => ({ upload })) },
    } as unknown as SupabaseClient;

    const path = await uploadEvidence(
      client,
      "user-1",
      "grupo",
      "factura",
      file("image/webp", 10),
    );
    expect(path).toMatch(/^user-1\/grupo\/factura-[0-9a-f-]{36}\.webp$/);
    expect(upload).toHaveBeenCalledWith(path, expect.any(File), {
      contentType: "image/webp",
      upsert: false,
    });
  });

  it("informa el error de subida y limpia rutas cuando hay alguna", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: "lleno" } });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const client = {
      storage: { from: vi.fn(() => ({ upload, remove })) },
    } as unknown as SupabaseClient;

    await expect(
      uploadEvidence(client, "u", "g", "s", file("image/png", 1)),
    ).rejects.toThrow("No se pudo subir evidencia: lleno");

    await removeEvidencePaths(client, []);
    expect(remove).not.toHaveBeenCalled();
    await removeEvidencePaths(client, ["a.png"]);
    expect(remove).toHaveBeenCalledWith(["a.png"]);
  });
});

describe("presentación de notificaciones", () => {
  it("usa la etiqueta del evento, luego el título y por último un texto genérico", () => {
    expect(
      humanNotificationTitle({ event_type: "devolucion_creada", title: "x" }),
    ).toBe("Nueva devolucion");
    expect(
      humanNotificationTitle({ event_type: "otro", title: " Aviso " }),
    ).toBe("Aviso");
    expect(
      humanNotificationTitle({
        event_type: "otro",
        title: undefined as unknown as string,
      }),
    ).toBe("Notificacion operacional");
  });

  it("da un mensaje por defecto y tolera fechas inválidas", () => {
    expect(humanNotificationMessage({ message: "  " })).toBe(
      "Se registro una actualizacion operacional.",
    );
    expect(formatNotificationDate("no-es-fecha")).toBe("Fecha no disponible");
    expect(formatNotificationDate("2026-10-29T12:00:00Z")).toMatch(/2026/);
  });
});
