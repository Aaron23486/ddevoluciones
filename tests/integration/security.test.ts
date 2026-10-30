import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "../../scripts/lib/supabase-local.mts";
import {
  BUCKET,
  PNG,
  rpc,
  RUN,
  TestEnvironment,
  testPassword,
  type Account,
} from "./support";

const env = new TestEnvironment();
let users: Record<Role, Account>;

beforeAll(async () => {
  users = await env.accounts();
});

afterAll(async () => {
  await env.cleanup();
});

describe("perfiles y privilegios", () => {
  it("un usuario no lee perfiles ajenos; admin sí", async () => {
    const { data: own } = await users.pesado.client
      .from("profiles")
      .select("id")
      .eq("id", users.inventario.id);
    expect(own).toEqual([]);

    const { data: admin } = await users.admin.client
      .from("profiles")
      .select("id")
      .eq("id", users.inventario.id);
    expect(admin).toHaveLength(1);
  });

  it("nadie cambia su propio rol ni estado escribiendo en profiles", async () => {
    const { error } = await users.pesado.client
      .from("profiles")
      .update({ role: "admin", is_active: true })
      .eq("id", users.pesado.id);
    expect(error).not.toBeNull();

    const { data } = await env.service
      .from("profiles")
      .select("role")
      .eq("id", users.pesado.id)
      .single();
    expect(data?.role).toBe("pesado");
  });

  it("las RPC de administración rechazan a quien no es admin", async () => {
    for (const role of ["devoluciones", "inventario", "seguridad"] as const) {
      const toAdmin = await rpc(users[role].client, "admin_set_user_role", {
        p_user_id: users[role].id,
        p_role: "admin",
      });
      expect(toAdmin.error, role).toMatch(/Admin role required/);

      const deactivate = await rpc(
        users[role].client,
        "admin_set_user_active",
        {
          p_user_id: users.admin.id,
          p_is_active: false,
        },
      );
      expect(deactivate.error, role).toMatch(/Admin role required/);
    }
  });

  it("un perfil inactivo no puede operar aunque conserve la sesión", async () => {
    const account = await env.account("devoluciones");
    await env.service
      .from("profiles")
      .update({ is_active: false })
      .eq("id", account.id);
    const { error } = await rpc(account.client, "crear_devolucion", {
      p_factura: `IT-${RUN}-INACTIVA`,
      p_articulo: "X",
      p_cantidad: 1,
      p_clasificacion: "bueno",
      p_descripcion: "X",
      p_flujo: "pesado",
      p_transportista_nombre: "X",
      p_transportista_cedula: "X",
      p_placa_camion: "X",
      p_factura_path: "x",
      p_material_path: "x",
    });
    expect(error).toMatch(/AUTH_NOT_ACTIVE/);
  });

  it("las funciones internas no están expuestas a las sesiones", async () => {
    for (const name of [
      "ep3_record_event",
      "ep3_recalculate_parent",
      "keep_an_active_admin",
      "handle_new_user_profile",
    ]) {
      const { error } = await rpc(users.admin.client, name);
      expect(error, name).not.toBeNull();
    }
  });
});

describe("cuentas", () => {
  it("el registro público está cerrado", async () => {
    const anon = createClient(env.target.url, env.target.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signUp({
      email: `it-signup-${RUN}@example.test`,
      password: testPassword(),
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("una cuenta nueva nace inactiva y con el rol mínimo", async () => {
    const account = await env.account("devoluciones", { keepDefault: true });
    const { data } = await env.service
      .from("profiles")
      .select("role, is_active")
      .eq("id", account.id)
      .single();
    expect(data).toEqual({ role: "devoluciones", is_active: false });
  });

  it("no se puede retirar el último admin activo y cada cambio queda auditado", async () => {
    const { data: admins } = await env.service
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true);
    // Deja temporalmente a la cuenta de prueba como único admin activo.
    const others = (admins ?? [])
      .map((row) => row.id as string)
      .filter((id) => id !== users.admin.id);
    for (const id of others) {
      await env.service
        .from("profiles")
        .update({ is_active: false })
        .eq("id", id);
    }
    try {
      const { error } = await env.service
        .from("profiles")
        .update({ role: "pesado" })
        .eq("id", users.admin.id);
      expect(error?.message).toMatch(/LAST_ADMIN_REQUIRED/);
    } finally {
      for (const id of others) {
        await env.service
          .from("profiles")
          .update({ is_active: true })
          .eq("id", id);
      }
    }

    const { data: events } = await users.admin.client
      .from("profile_access_events")
      .select("new_role, new_is_active")
      .eq("profile_id", users.admin.id);
    expect(events?.some((e) => e.new_role === "admin" && e.new_is_active)).toBe(
      true,
    );

    const { data: hidden } = await users.pesado.client
      .from("profile_access_events")
      .select("id");
    expect(hidden).toEqual([]);
  });
});

describe("evidencias privadas", () => {
  it("nadie sube archivos a la carpeta de otro usuario", async () => {
    const { error } = await users.pesado.client.storage
      .from(BUCKET)
      .upload(`${users.inventario.id}/it/${RUN}-ajeno.png`, PNG, {
        contentType: "image/png",
      });
    expect(error).not.toBeNull();
  });

  it("transportes no sube evidencias de devoluciones; sí de reportes de carga", async () => {
    const devolucion = await users.transportes.client.storage
      .from(BUCKET)
      .upload(`${users.transportes.id}/it/${RUN}.png`, PNG, {
        contentType: "image/png",
      });
    expect(devolucion.error).not.toBeNull();

    const path = await env.upload(users.transportes, "reportes-carga");
    expect(path).toContain("/reportes-carga/");
  });

  it("solo se puede borrar una evidencia propia que aún no está asociada", async () => {
    const loose = await env.upload(users.devoluciones);
    const { data: removed } = await users.devoluciones.client.storage
      .from(BUCKET)
      .remove([loose]);
    expect(removed).toHaveLength(1);

    const id = await env.createDevolucion(
      users.devoluciones,
      "pesado",
      "bueno",
    );
    const { data: evidence } = await env.service
      .from("devolucion_evidencias")
      .select("url")
      .eq("devolucion_id", id);
    const referenced = evidence?.map((row) => row.url as string) ?? [];
    expect(referenced).toHaveLength(2);

    const { data: kept } = await users.devoluciones.client.storage
      .from(BUCKET)
      .remove(referenced);
    expect(kept).toEqual([]);
    const { data: still } = await env.service.storage
      .from(BUCKET)
      .list(referenced[0].split("/").slice(0, -1).join("/"));
    expect(still?.length).toBeGreaterThanOrEqual(2);
  });

  it("transportes y seguridad no leen evidencias de devoluciones", async () => {
    const id = await env.createDevolucion(
      users.devoluciones,
      "pesado",
      "bueno",
    );
    for (const role of ["transportes", "seguridad"] as const) {
      const { data } = await users[role].client
        .from("devolucion_evidencias")
        .select("url")
        .eq("devolucion_id", id);
      expect(data, role).toEqual([]);
    }
  });
});

describe("entradas validadas en la base", () => {
  const nueva = (overrides: Record<string, unknown>) => ({
    p_factura: `IT-${RUN}-VAL`,
    p_articulo: "Articulo",
    p_cantidad: 1,
    p_clasificacion: "bueno",
    p_descripcion: "Prueba de validacion",
    p_flujo: "pesado",
    p_transportista_nombre: "Transportista",
    p_transportista_cedula: "0-0000-0000",
    p_placa_camion: "IT-001",
    ...overrides,
  });

  it("una evidencia debe ser un archivo propio que exista", async () => {
    const ajena = await env.upload(users.pesado);
    const propia = await env.upload(users.devoluciones);

    const conAjena = await rpc(
      users.devoluciones.client,
      "crear_devolucion",
      nueva({ p_factura_path: ajena, p_material_path: propia }),
    );
    expect(conAjena.error).toMatch(/EVIDENCE_PATH_INVALID/);

    const inexistente = await rpc(
      users.devoluciones.client,
      "crear_devolucion",
      nueva({
        p_factura_path: `${users.devoluciones.id}/it/no-existe.png`,
        p_material_path: propia,
      }),
    );
    expect(inexistente.error).toMatch(/EVIDENCE_PATH_INVALID/);
  });

  it("una evidencia de devoluciones no puede venir del área de reportes de carga", async () => {
    const carga = await env.upload(users.admin, "reportes-carga");
    const propia = await env.upload(users.admin);
    const { error } = await rpc(
      users.admin.client,
      "crear_devolucion",
      nueva({ p_factura_path: carga, p_material_path: propia }),
    );
    expect(error).toMatch(/EVIDENCE_PATH_INVALID/);
  });

  it("los textos tienen un largo máximo aunque se llame la RPC directamente", async () => {
    const { error } = await rpc(
      users.devoluciones.client,
      "crear_devolucion",
      nueva({
        p_factura: `IT-${RUN}-${"x".repeat(200)}`,
        p_factura_path: await env.upload(users.devoluciones),
        p_material_path: await env.upload(users.devoluciones),
      }),
    );
    expect(error).toMatch(/devoluciones_text_lengths/);
  });

  it("la analítica antigua ya no está disponible para las sesiones", async () => {
    for (const role of ["admin", "devoluciones"] as const) {
      const { error } = await rpc(
        users[role].client,
        "get_operational_analytics_ep4",
        {
          p_bucket: null,
          p_modulo: null,
          p_estado_devolucion: null,
          p_flujo: null,
          p_material: null,
          p_mes: null,
          p_estado_reporte: null,
        },
      );
      expect(error, role).toMatch(/permission denied/);
    }
  });
});
