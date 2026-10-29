import { randomInt } from "node:crypto";

import { z } from "zod";

// Más estricta que el mínimo de Supabase Auth (10): las cuentas que se crean desde la
// terminal llevan al menos 12 caracteres con letras y números.
export const newPasswordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(72, "La contraseña no puede superar 72 caracteres.")
  .regex(/[A-Za-z]/, "La contraseña debe incluir letras.")
  .regex(/\d/, "La contraseña debe incluir números.");

// Sin caracteres que se confunden al copiarlos a mano (0/O, 1/l/I).
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUPS = 4;
const GROUP_LENGTH = 4;

// Contraseña aleatoria del tipo «k7Rm-x2Qa-Hp9d-Wn4e» (16 caracteres al azar, unos 93 bits).
export function generateDemoPassword(): string {
  for (;;) {
    const password = Array.from({ length: GROUPS }, () =>
      Array.from(
        { length: GROUP_LENGTH },
        () => ALPHABET[randomInt(ALPHABET.length)],
      ).join(""),
    ).join("-");
    if (newPasswordSchema.safeParse(password).success) return password;
  }
}
