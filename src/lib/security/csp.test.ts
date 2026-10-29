import { describe, expect, it } from "vitest";

import { hardenSessionCookie } from "@/lib/supabase/cookie-options";

import { buildContentSecurityPolicy, createNonce } from "./csp";

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values.join(" ")];
    }),
  );
}

describe("Content Security Policy", () => {
  it("en producción solo ejecuta scripts con el nonce de la respuesta", () => {
    const policy = directives(
      buildContentSecurityPolicy({ nonce: "abc123", isDevelopment: false }),
    );

    expect(policy.get("script-src")).toBe(
      "'self' 'nonce-abc123' 'strict-dynamic'",
    );
    expect(policy.get("script-src")).not.toContain("unsafe-inline");
    expect(policy.get("connect-src")).toBe("'self'");
    expect(policy.get("frame-ancestors")).toBe("'none'");
    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.has("upgrade-insecure-requests")).toBe(true);
  });

  it("en desarrollo añade eval para React y conexiones del servidor de desarrollo", () => {
    const policy = directives(
      buildContentSecurityPolicy({ nonce: "n", isDevelopment: true }),
    );

    expect(policy.get("script-src")).toContain("'unsafe-eval'");
    expect(policy.get("connect-src")).toContain("ws: http: https:");
    expect(policy.has("upgrade-insecure-requests")).toBe(false);
  });

  it("genera un nonce distinto en cada solicitud", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));

    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
  });
});

describe("cookie de sesión", () => {
  it("es httpOnly, SameSite=Lax y dura lo mismo que la sesión", () => {
    const options = hardenSessionCookie({ maxAge: 400 * 24 * 60 * 60 });

    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
  });

  it("respeta el borrado de la cookie", () => {
    expect(hardenSessionCookie({ maxAge: 0 }).maxAge).toBe(0);
  });
});
