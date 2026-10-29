import { afterAll, describe, expect, it } from "vitest";

import {
  setPassword,
  signedInClient,
} from "../../scripts/lib/supabase-local.mts";
import { rpc, TestEnvironment } from "./support";

const env = new TestEnvironment();

afterAll(async () => {
  await env.cleanup();
});

describe("contraseñas solo desde la terminal", () => {
  it("una sesión no puede cambiar su propia contraseña", async () => {
    const account = await env.account("pesado");
    const { error } = await account.client.auth.updateUser({
      password: "Otra-Clave-Segura-2026",
    });
    expect(error).not.toBeNull();
    await expect(
      signedInClient(env.target, account.email, account.password),
    ).resolves.toBeDefined();
  });

  it("la API de administración de Auth tampoco cambia contraseñas", async () => {
    const account = await env.account("inventario");
    const { error } = await env.service.auth.admin.updateUserById(account.id, {
      password: "Otra-Clave-Segura-2026",
    });
    expect(error).not.toBeNull();
  });

  it("la función de terminal la cambia y cierra las sesiones abiertas", async () => {
    const account = await env.account("almacen");
    const nueva = "Nueva-Clave-Segura-2026";

    await setPassword(env.service, account.id, nueva);

    // La sesión abierta antes del cambio ya no se puede renovar.
    const { error: refreshError } = await account.client.auth.refreshSession();
    expect(refreshError).not.toBeNull();
    await expect(
      signedInClient(env.target, account.email, account.password),
    ).rejects.toThrow();
    await expect(
      signedInClient(env.target, account.email, nueva),
    ).resolves.toBeDefined();
  });

  it("la función de terminal rechaza contraseñas débiles y no está abierta a sesiones", async () => {
    const account = await env.account("admin");
    await expect(
      setPassword(env.service, account.id, "corta1"),
    ).rejects.toThrow(/22023/);
    const { error } = await rpc(account.client, "terminal_set_password", {
      p_user_id: account.id,
      p_password: "Nueva-Clave-Segura-2026",
    });
    expect(error).not.toBeNull();
  });
});
