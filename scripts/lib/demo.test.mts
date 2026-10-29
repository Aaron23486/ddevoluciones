import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  DEMO_ACCOUNTS,
  demoEvidencePng,
  demoFactura,
  seededRandom,
} from "./demo-data.mts";
import { generateDemoPassword, newPasswordSchema } from "./passwords.mts";
import { isLocalUrl, ROLES } from "./supabase-local.mts";

describe("datos de demostración", () => {
  it("define una cuenta ficticia por cada rol", () => {
    expect(DEMO_ACCOUNTS.map((account) => account.role)).toEqual([...ROLES]);
    for (const account of DEMO_ACCOUNTS) {
      expect(account.email).toMatch(/^[a-z]+\.demo@example\.com$/);
    }
  });

  it("numera las facturas de demostración con prefijo propio", () => {
    expect(demoFactura(7)).toBe("DEMO-0007");
    expect(demoFactura(512)).toBe("DEMO-0512");
  });

  it("repite la misma secuencia con la misma semilla", () => {
    const a = seededRandom(2026);
    const b = seededRandom(2026);
    const values = Array.from({ length: 5 }, () => a());

    expect(values).toEqual(Array.from({ length: 5 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("genera una imagen PNG válida para las evidencias", () => {
    const png = demoEvidencePng([10, 20, 30], 8, 4);

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.readUInt32BE(16)).toBe(8);
    expect(png.readUInt32BE(20)).toBe(4);
    const idatLength = png.readUInt32BE(33);
    const pixels = inflateSync(png.subarray(41, 41 + idatLength));
    expect(pixels.length).toBe((8 * 3 + 1) * 4);
  });
});

describe("contraseñas", () => {
  it("exige 12 caracteres con letras y números", () => {
    expect(newPasswordSchema.safeParse("corta1").success).toBe(false);
    expect(newPasswordSchema.safeParse("solamenteletras").success).toBe(false);
    expect(newPasswordSchema.safeParse("123456789012").success).toBe(false);
    expect(newPasswordSchema.safeParse("x".repeat(73) + "1").success).toBe(
      false,
    );
    expect(newPasswordSchema.safeParse("Prueba-Segura-2026").success).toBe(
      true,
    );
  });

  it("genera contraseñas de demostración que cumplen la regla y no se repiten", () => {
    const passwords = Array.from({ length: 20 }, generateDemoPassword);

    for (const password of passwords) {
      expect(password).toMatch(/^([A-Za-z2-9]{4}-){3}[A-Za-z2-9]{4}$/);
      expect(newPasswordSchema.safeParse(password).success).toBe(true);
    }
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});

describe("destino de Supabase", () => {
  it("solo considera locales las direcciones de esta máquina", () => {
    expect(isLocalUrl("http://127.0.0.1:55421")).toBe(true);
    expect(isLocalUrl("http://localhost:55421")).toBe(true);
    expect(isLocalUrl("https://proyecto.supabase.co")).toBe(false);
    expect(isLocalUrl("no es una url")).toBe(false);
  });
});
