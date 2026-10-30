import { describe, expect, it } from "vitest";
import { signInSchema } from "@/schemas/auth";

describe("esquema del login", () => {
  it("acepta direcciones de Gmail", () => {
    const result = signInSchema.safeParse({
      email: "pruebasadmin@gmail.com",
      password: "demo-password",
    });
    expect(result.success).toBe(true);
  });

  it("acepta las direcciones de demostración de example.com", () => {
    const result = signInSchema.safeParse({
      email: "admin.demo@example.com",
      password: "demo-password",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza correos mal formados", () => {
    const result = signInSchema.safeParse({
      email: "not-an-email",
      password: "demo-password",
    });
    expect(result.success).toBe(false);
  });

  it("exige contraseña", () => {
    const result = signInSchema.safeParse({
      email: "admin.demo@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
