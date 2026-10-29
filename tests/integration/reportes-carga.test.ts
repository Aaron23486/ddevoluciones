import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "../../scripts/lib/supabase-local.mts";
import { rpc, rpcOk, TestEnvironment, testRef, type Account } from "./support";

const env = new TestEnvironment();
let users: Record<Role, Account>;

beforeAll(async () => {
  users = await env.accounts();
});

afterAll(async () => {
  await env.cleanup();
});

async function createReport(author: Account) {
  return rpc<string>(author.client, "crear_reporte_carga_ep4", {
    p_numero_documento: testRef("DOC"),
    p_factura: null,
    p_cliente: "Cliente de prueba",
    p_articulo: "Articulo de prueba",
    p_descripcion_material: null,
    p_cantidad: 3,
    p_transportista: "Transportista Prueba",
    p_ruta: "R-IT",
    p_placa: "it123",
    p_motivo_no_entrega: "Cliente ausente",
    p_estado_fisico_carga: "Buen estado",
    p_observaciones_retorno: null,
    p_evidencia_path: await env.upload(author, "reportes-carga"),
  });
}

async function estado(id: string) {
  const { data } = await env.service
    .from("reportes_carga")
    .select("estado, is_active")
    .eq("id", id)
    .single();
  return data;
}

describe("reporte de carga", () => {
  it("transportes, seguridad e inventario registran retornos; los demás no", async () => {
    for (const role of ["transportes", "seguridad", "inventario"] as const) {
      const { data, error } = await createReport(users[role]);
      expect(error, role).toBeNull();
      expect((await estado(data as string))?.estado).toBe(
        "pendiente_redespacho",
      );
    }
    for (const role of ["devoluciones", "pesado", "almacen"] as const) {
      const { error } = await rpc(
        users[role].client,
        "crear_reporte_carga_ep4",
        {
          p_numero_documento: testRef("NO"),
          p_factura: null,
          p_cliente: "X",
          p_articulo: "X",
          p_descripcion_material: null,
          p_cantidad: 1,
          p_transportista: null,
          p_ruta: null,
          p_placa: null,
          p_motivo_no_entrega: "X",
          p_estado_fisico_carga: "Buen estado",
          p_observaciones_retorno: null,
          p_evidencia_path: "x",
        },
      );
      expect(error, role).not.toBeNull();
    }
  });

  it("solo inventario o admin redespachan, y el historial lo registra", async () => {
    const id = (await createReport(users.transportes)).data as string;
    const args = async (account: Account) => ({
      p_reporte_carga_id: id,
      p_conductor: "Conductor Prueba",
      p_placa_salida: "sal123",
      p_observaciones: "Salida de prueba",
      p_evidencia_path: await env.upload(account, "reportes-carga"),
    });

    const denied = await rpc(
      users.transportes.client,
      "redespachar_reporte_carga_ep4",
      await args(users.transportes),
    );
    expect(denied.error).not.toBeNull();

    await rpcOk(
      users.inventario.client,
      "redespachar_reporte_carga_ep4",
      await args(users.inventario),
    );
    expect((await estado(id))?.estado).toBe("redespachado");

    const { data: history } = await users.inventario.client
      .from("reportes_carga_historial")
      .select("accion")
      .eq("reporte_carga_id", id);
    expect(history?.map((h) => h.accion)).toEqual(
      expect.arrayContaining(["retorno_registrado", "redespacho_registrado"]),
    );
  });

  it("solo admin anula, y el reporte anulado desaparece de los listados", async () => {
    const id = (await createReport(users.seguridad)).data as string;
    const denied = await rpc(
      users.inventario.client,
      "anular_reporte_carga_ep4",
      {
        p_reporte_carga_id: id,
      },
    );
    expect(denied.error).not.toBeNull();

    await rpcOk(users.admin.client, "anular_reporte_carga_ep4", {
      p_reporte_carga_id: id,
    });
    expect((await estado(id))?.is_active).toBe(false);

    const { data: visible } = await users.seguridad.client
      .from("reportes_carga")
      .select("id")
      .eq("id", id);
    expect(visible).toEqual([]);
  });

  it("los roles sin acceso al módulo no leen reportes", async () => {
    const id = (await createReport(users.inventario)).data as string;
    for (const role of ["devoluciones", "pesado", "almacen"] as const) {
      const { data } = await users[role].client
        .from("reportes_carga")
        .select("id")
        .eq("id", id);
      expect(data, role).toEqual([]);
    }
  });
});

describe("notificaciones", () => {
  it("cada usuario recibe las notificaciones de su rol y puede marcarlas como leídas", async () => {
    await env.createDevolucion(users.devoluciones, "pesado", "bueno");
    const list = await rpcOk<Array<{ id: string; event_type: string }>>(
      users.pesado.client,
      "get_my_notifications_ep4",
      { p_limit: 50 },
    );
    const created = list.find((n) => n.event_type === "devolucion_creada");
    expect(created).toBeDefined();

    await rpcOk(users.pesado.client, "mark_internal_notification_read_ep4", {
      p_notification_id: created!.id,
    });

    const seguridad = await rpcOk<Array<{ event_type: string }>>(
      users.seguridad.client,
      "get_my_notifications_ep4",
      { p_limit: 50 },
    );
    expect(seguridad.some((n) => n.event_type === "devolucion_creada")).toBe(
      false,
    );
  });
});
