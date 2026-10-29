import { z } from "zod";

const optionalPositiveInteger = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  return Number(value);
}, z.number().int().positive().optional());

export const createDevolucionSchema = z.object({
  factura: z.string().trim().min(1).max(120),
  articulo: z.string().trim().min(1).max(160),
  cantidad: z.coerce.number().int().positive(),
  clasificacion: z.enum(["bueno", "malo", "mixto"]),
  descripcion: z.string().trim().min(1).max(2000),
  flujo: z.enum(["pesado", "almacen"]),
  transportistaNombre: z.string().trim().min(1).max(160),
  transportistaCedula: z.string().trim().min(1).max(80),
  placaCamion: z.string().trim().min(1).max(40),
});

export const receptionSchema = z
  .object({
    devolucionId: z.string().uuid(),
    cantidadRecibida: z.coerce.number().int().positive(),
    clasificacion: z.enum(["bueno", "malo", "mixto"]),
    cantidadBueno: optionalPositiveInteger,
    cantidadMalo: optionalPositiveInteger,
    observaciones: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.clasificacion !== "mixto") return;

    if (
      value.cantidadBueno === undefined ||
      value.cantidadMalo === undefined ||
      value.cantidadBueno + value.cantidadMalo !== value.cantidadRecibida
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cantidadBueno"],
        message:
          "En Mixto, Bueno + Malo debe ser igual a la cantidad recibida.",
      });
    }
  });

export const inventorySchema = z.object({
  devolucionId: z.string().uuid(),
  palletCodigo: z.string().trim().min(1).max(120),
  observaciones: z.string().trim().max(2000).optional(),
  cantidadBueno: optionalPositiveInteger,
  cantidadMalo: optionalPositiveInteger,
});

export const locationSchema = z.object({
  materialId: z.string().uuid(),
  ubicacion: z.string().trim().min(1).max(300),
  observaciones: z.string().trim().max(2000).optional(),
});

export const dispositionSchema = z.object({
  materialId: z.string().uuid(),
  decisionFinal: z.string().trim().min(1).max(500),
  observaciones: z.string().trim().min(1).max(2000),
});
