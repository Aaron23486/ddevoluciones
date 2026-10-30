import { z } from "zod";

function optionalText(max: number) {
  return z.preprocess((value) => {
    const text = String(value ?? "").trim();
    return text.length ? text : undefined;
  }, z.string().max(max).optional());
}

export const createReporteCargaSchema = z.object({
  numeroDocumento: optionalText(120),
  factura: optionalText(120),
  cliente: z.string().trim().min(1).max(300),
  articulo: z.string().trim().min(1).max(300),
  descripcionMaterial: optionalText(2000),
  cantidad: z.coerce.number().int().positive(),
  transportista: optionalText(300),
  ruta: optionalText(120),
  placa: optionalText(100),
  motivoNoEntrega: z.string().trim().min(1).max(2000),
  estadoFisicoCarga: z.enum(["Buen estado", "Mal estado"]),
  observacionesRetorno: optionalText(2000),
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
