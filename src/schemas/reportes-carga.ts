import { z } from "zod";

const optionalText = z.preprocess((value) => {
  const text = String(value ?? "").trim();
  return text.length ? text : undefined;
}, z.string().max(2000).optional());

export const createReporteCargaSchema = z.object({
  numeroDocumento: optionalText,
  factura: optionalText,
  cliente: z.string().trim().min(1).max(300),
  articulo: z.string().trim().min(1).max(300),
  descripcionMaterial: optionalText,
  cantidad: z.coerce.number().int().positive(),
  transportista: optionalText,
  ruta: optionalText,
  placa: optionalText,
  motivoNoEntrega: z.string().trim().min(1).max(2000),
  estadoFisicoCarga: z.enum(["Buen estado", "Mal estado"]),
  observacionesRetorno: optionalText,
});

export const redispatchReporteCargaSchema = z.object({
  reporteCargaId: z.string().uuid(),
  conductor: z.string().trim().min(1).max(300),
  placaSalida: z.string().trim().min(1).max(100),
  observaciones: z.string().trim().min(1).max(2000),
});

export const annulReporteCargaSchema = z.object({
  reporteCargaId: z.string().uuid(),
});
