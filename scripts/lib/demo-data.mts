import { crc32, deflateSync } from "node:zlib";

import type { Role } from "./supabase-local.mts";

// Datos ficticios para la demostración local. Ninguno corresponde a personas o empresas reales.

export const DEMO_ACCOUNTS: readonly {
  email: string;
  fullName: string;
  role: Role;
}[] = [
  { email: "admin.demo@example.com", fullName: "Demo Admin", role: "admin" },
  {
    email: "devoluciones.demo@example.com",
    fullName: "Demo Devoluciones",
    role: "devoluciones",
  },
  { email: "pesado.demo@example.com", fullName: "Demo Pesado", role: "pesado" },
  {
    email: "inventario.demo@example.com",
    fullName: "Demo Inventario",
    role: "inventario",
  },
  {
    email: "almacen.demo@example.com",
    fullName: "Demo Almacen",
    role: "almacen",
  },
  {
    email: "transportes.demo@example.com",
    fullName: "Demo Transportes",
    role: "transportes",
  },
  {
    email: "seguridad.demo@example.com",
    fullName: "Demo Seguridad",
    role: "seguridad",
  },
];

export const DEMO_ARTICLES = [
  "Cocina electrica",
  "Dispensador de agua",
  "Lavadora automatica",
  "Refrigeradora 14 pies",
  "Microondas 1.1",
  "Televisor 50 pulgadas",
] as const;

export const DEMO_CARRIERS = [
  { name: "Daniel Rojas", id: "1-0000-0001" },
  { name: "Henry Vargas", id: "1-0000-0002" },
  { name: "Luis Solano", id: "1-0000-0003" },
  { name: "Marta Jimenez", id: "1-0000-0004" },
] as const;

export const DEMO_CLIENTS = [
  "Tienda Norte Demo",
  "Comercial Sur Demo",
  "Hogar Central Demo",
  "Distribuidora Este Demo",
] as const;

export const DEMO_ROUTES = ["R-01", "R-02", "R-03", "R-04"] as const;

// Etapa final de cada devolución de demostración.
export type DemoStage = "registrada" | "recibida" | "en_proceso" | "cerrada";

export const DEMO_DEVOLUCIONES = 28;
export const DEMO_REPORTES_CARGA = 12;
export const DEMO_HISTORY_DAYS = 90;

export function demoFactura(sequence: number): string {
  return `DEMO-${String(sequence).padStart(4, "0")}`;
}

// Generador pseudoaleatorio con semilla: los mismos datos en cada instalación.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Imagen PNG de relleno para las evidencias de demostración: franjas diagonales de un color.
export function demoEvidencePng(
  rgb: readonly [number, number, number],
  width = 480,
  height = 320,
): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const shade = Math.floor((x + y) / 24) % 2 === 0 ? 1 : 0.82;
      const offset = row + 1 + x * 3;
      raw[offset] = Math.round(rgb[0] * shade);
      raw[offset + 1] = Math.round(rgb[1] * shade);
      raw[offset + 2] = Math.round(rgb[2] * shade);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits por canal
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
