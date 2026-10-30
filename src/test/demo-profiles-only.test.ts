import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("acceso solo por perfiles (contrato)", () => {
  it("conserva el control de admin y las acciones de rol y estado", () => {
    const users = source("src/app/(protected)/usuarios/page.tsx");
    expect(users).toContain('requireRole(ROUTE_ROLES["/usuarios"])');
    expect(users).toContain("setUserActive");
    expect(users).toContain("setUserRole");
    expect(users).toContain('from("profiles")');
  });

  it("Usuarios no muestra ni consulta solicitudes de acceso", () => {
    const users = source("src/app/(protected)/usuarios/page.tsx");
    expect(users).not.toMatch(
      /user_access_requests|safeRequests|approveAccessRequest|rejectAccessRequest|Solicitudes pendientes|<h2>Solicitudes<\/h2>/i,
    );
  });

  it("el login no permite registro ni solicitudes de acceso", () => {
    const login = source("src/app/login/page.tsx");
    const auth = source("src/features/auth/actions.ts");
    expect(login).toContain("signIn");
    expect(login).not.toMatch(
      /signUp|requestAccess|Enviar solicitud|Solicitar acceso/i,
    );
    expect(auth).not.toContain('from("user_access_requests")');
  });

  it("documenta y crea cada rol de demostración", () => {
    const readme = source("README.md");
    const seed = source("scripts/lib/demo-data.mts");
    for (const role of [
      "admin",
      "devoluciones",
      "pesado",
      "inventario",
      "almacen",
      "transportes",
      "seguridad",
    ]) {
      expect(readme).toContain(`\`${role}\``);
      expect(seed).toContain(`role: "${role}"`);
    }
    expect(seed).not.toMatch(/(password|service_role)\s*[:=]/i);
  });
});
