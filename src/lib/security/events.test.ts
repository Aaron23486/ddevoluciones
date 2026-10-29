import { afterEach, describe, expect, it, vi } from "vitest";

import { emailFingerprint, securityEvent } from "./events";

afterEach(() => vi.restoreAllMocks());

describe("eventos de seguridad", () => {
  it("identifica el correo con una huella estable que no lo revela", () => {
    const fingerprint = emailFingerprint(" Admin@Example.Test ");

    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint).toBe(emailFingerprint("admin@example.test"));
    expect(fingerprint).not.toBe(emailFingerprint("otro@example.test"));
  });

  it("escribe una línea JSON sin datos sensibles", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const line = securityEvent("login.failed", {
      emailFingerprint: emailFingerprint("admin@example.test"),
    });

    expect(warn).toHaveBeenCalledWith(line);
    const event = JSON.parse(line);
    expect(event).toMatchObject({ type: "security", event: "login.failed" });
    expect(Date.parse(event.at)).not.toBeNaN();
    expect(line).not.toContain("@");
  });

  it("registra el usuario cuando se conoce", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const event = JSON.parse(
      securityEvent("access.denied_role", { userId: "u-1" }),
    );

    expect(event).toMatchObject({
      event: "access.denied_role",
      userId: "u-1",
    });
  });
});
