import { describe, expect, it } from "vitest";
import { signInSchema } from "@/schemas/auth";

describe("demo login schema", () => {
  it("accepts Gmail addresses", () => {
    const result = signInSchema.safeParse({
      email: "pruebasadmin@gmail.com",
      password: "demo-password",
    });
    expect(result.success).toBe(true);
  });

  it("accepts reserved example.com demo addresses", () => {
    const result = signInSchema.safeParse({
      email: "admin.demo@example.com",
      password: "demo-password",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed email", () => {
    const result = signInSchema.safeParse({
      email: "not-an-email",
      password: "demo-password",
    });
    expect(result.success).toBe(false);
  });

  it("requires a password", () => {
    const result = signInSchema.safeParse({
      email: "admin.demo@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
