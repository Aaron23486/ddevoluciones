import { expect, test } from "@playwright/test";

import { storageFile } from "./support.mts";

test.use({ storageState: storageFile("admin") });

test("cada respuesta lleva una CSP con nonce propio y sin scripts inline", async ({
  page,
}) => {
  const first = await page.goto("/devoluciones");
  const second = await page.goto("/devoluciones");
  const policies = [first, second].map(
    (response) => response!.headers()["content-security-policy"],
  );

  for (const policy of policies) {
    expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
  }
  const nonce = (policy: string) => policy.match(/'nonce-([^']+)'/)![1];
  expect(nonce(policies[0])).not.toBe(nonce(policies[1]));

  const scripts = await page
    .locator("script[src]")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).nonce),
    );
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every(Boolean)).toBe(true);
});

test("un manejador de eventos inyectado no se ejecuta", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) {
      violations.push(message.text());
    }
  });
  await page.goto("/devoluciones");

  const ran = await page.evaluate(async () => {
    const holder = document.createElement("div");
    holder.innerHTML = '<img src="data:," onerror="window.__injected = true">';
    document.body.append(holder);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return (window as unknown as { __injected?: boolean }).__injected === true;
  });

  expect(ran).toBe(false);
  expect(violations.join("\n")).toContain("inline event handler");
});

test("la cookie de sesión es httpOnly, SameSite=Lax y dura 12 horas", async ({
  page,
  context,
}) => {
  await page.goto("/devoluciones");
  const cookies = (await context.cookies()).filter((c) =>
    c.name.startsWith("sb-"),
  );
  expect(cookies.length).toBeGreaterThan(0);

  for (const cookie of cookies) {
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    const hoursLeft = (cookie.expires * 1000 - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(11);
    expect(hoursLeft).toBeLessThanOrEqual(12);
  }
  expect(await page.evaluate(() => document.cookie)).toBe("");
});

test("las cabeceras de seguridad están presentes", async ({ page }) => {
  const response = await page.goto("/devoluciones");
  const headers = response!.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-powered-by"]).toBeUndefined();
});
