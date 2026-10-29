import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "../../scripts/lib/supabase-local.mts";
import {
  rpc,
  rpcOk,
  TestEnvironment,
  type Account,
  type Classification,
  type Flow,
} from "./support";

const env = new TestEnvironment();
let users: Record<Role, Account>;

beforeAll(async () => {
  users = await env.accounts();
});

afterAll(async () => {
  await env.cleanup();
});

function split(classification: Classification, total: number) {
  const good =
    classification === "mixto"
      ? total / 2
      : classification === "bueno"
        ? total
        : 0;
  return { good, bad: total - good };
}

async function receive(id: string, classification: Classification, total = 4) {
  const { good, bad } = split(classification, total);
  return rpc(users.pesado.client, "confirmar_recepcion_devolucion", {
    p_devolucion_id: id,
    p_cantidad_recibida: total,
    p_clasificacion: classification,
    p_cantidad_bueno: classification === "mixto" ? good : null,
    p_cantidad_malo: classification === "mixto" ? bad : null,
    p_observaciones: "Recepcion de prueba",
    p_factura_firmada_path: await env.upload(users.pesado),
    p_material_bueno_path: good > 0 ? await env.upload(users.pesado) : null,
    p_material_malo_path: bad > 0 ? await env.upload(users.pesado) : null,
  });
}

async function inventory(
  id: string,
  flow: Flow,
  classification: Classification,
) {
  const { good, bad } = split(classification, 4);
  await rpcOk(users.inventario.client, "procesar_inventario_devolucion", {
    p_devolucion_id: id,
    p_pallet_codigo: "PAL-IT",
    p_observaciones: "Inventario de prueba",
    p_evidencia_path: await env.upload(users.inventario),
    p_cantidad_bueno: flow === "almacen" ? good : null,
    p_cantidad_malo: flow === "almacen" ? bad : null,
  });
}

describe("flujos completos de devoluciones", () => {
  const cases: Array<[Flow, Classification]> = [
    ["pesado", "bueno"],
    ["pesado", "malo"],
    ["pesado", "mixto"],
    ["almacen", "bueno"],
    ["almacen", "malo"],
    ["almacen", "mixto"],
  ];

  it.each(cases)(
    "%s con material %s llega a cerrada cuando cierran todos sus materiales",
    async (flow, classification) => {
      const id = await env.createDevolucion(
        users.devoluciones,
        flow,
        classification,
      );
      expect(await env.estado(id)).toBe(
        flow === "pesado" ? "pendiente_entrega" : "pendiente_proceso",
      );

      if (flow === "pesado") {
        expect((await receive(id, classification)).error).toBeNull();
      }
      await inventory(id, flow, classification);

      const { data: materials } = await users.inventario.client
        .from("devolucion_materiales")
        .select("id, tipo_material")
        .eq("devolucion_id", id);
      expect(materials?.length).toBe(classification === "mixto" ? 2 : 1);

      for (const [index, material] of (materials ?? []).entries()) {
        if (material.tipo_material === "bueno") {
          const locator = flow === "pesado" ? users.pesado : users.almacen;
          await rpcOk(locator.client, "ubicar_material_devolucion", {
            p_material_id: material.id,
            p_ubicacion: "A-1-1",
            p_observaciones: "Ubicacion de prueba",
            p_evidencia_path: await env.upload(locator),
          });
        } else {
          await rpcOk(users.inventario.client, "disponer_material_devolucion", {
            p_material_id: material.id,
            p_decision_final: "Destruccion",
            p_observaciones: "Disposicion de prueba",
            p_evidencia_path: await env.upload(users.inventario),
          });
        }
        // Con material mixto el padre sigue abierto hasta cerrar el último hijo.
        if (index < (materials?.length ?? 0) - 1) {
          expect(await env.estado(id)).not.toBe("cerrada");
        }
      }

      expect(await env.estado(id)).toBe("cerrada");
      const { data: history } = await env.service
        .from("devolucion_historial")
        .select("accion")
        .eq("devolucion_id", id);
      expect(history?.length).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("reglas de negocio", () => {
  it("rechaza una recepción mixta cuyas cantidades no suman el total", async () => {
    const id = await env.createDevolucion(
      users.devoluciones,
      "pesado",
      "mixto",
    );
    const { error } = await rpc(
      users.pesado.client,
      "confirmar_recepcion_devolucion",
      {
        p_devolucion_id: id,
        p_cantidad_recibida: 4,
        p_clasificacion: "mixto",
        p_cantidad_bueno: 1,
        p_cantidad_malo: 1,
        p_observaciones: null,
        p_factura_firmada_path: await env.upload(users.pesado),
        p_material_bueno_path: await env.upload(users.pesado),
        p_material_malo_path: await env.upload(users.pesado),
      },
    );
    expect(error).not.toBeNull();
    expect(await env.estado(id)).toBe("pendiente_entrega");
  });

  it("acepta una sola recepción aunque lleguen dos a la vez", async () => {
    const id = await env.createDevolucion(
      users.devoluciones,
      "pesado",
      "bueno",
    );
    const results = await Promise.all([
      receive(id, "bueno"),
      receive(id, "bueno"),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);

    const { count } = await env.service
      .from("devolucion_materiales")
      .select("id", { count: "exact", head: true })
      .eq("devolucion_id", id);
    expect(count).toBe(1);
  });

  it("no permite recibir en Pesado una devolución del flujo Almacén", async () => {
    const id = await env.createDevolucion(
      users.devoluciones,
      "almacen",
      "bueno",
    );
    expect((await receive(id, "bueno")).error).toMatch(
      /INVALID_RECEPTION_STATE/,
    );
  });
});

describe("permisos por rol en las RPC", () => {
  it("solo admin y devoluciones registran devoluciones", async () => {
    for (const role of [
      "pesado",
      "inventario",
      "almacen",
      "transportes",
      "seguridad",
    ] as const) {
      const { error } = await rpc(users[role].client, "crear_devolucion", {
        p_factura: "IT-PROHIBIDA",
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
      expect(error, role).toMatch(/FORBIDDEN_ROLE/);
    }
  });

  it("solo inventario y admin procesan inventario", async () => {
    const id = await env.createDevolucion(
      users.devoluciones,
      "almacen",
      "bueno",
    );
    for (const role of ["devoluciones", "pesado", "almacen"] as const) {
      const { error } = await rpc(
        users[role].client,
        "procesar_inventario_devolucion",
        {
          p_devolucion_id: id,
          p_pallet_codigo: "X",
          p_observaciones: null,
          p_evidencia_path: "x",
          p_cantidad_bueno: 4,
          p_cantidad_malo: 0,
        },
      );
      expect(error, role).toMatch(/FORBIDDEN_ROLE/);
    }
  });

  it("solo admin elimina devoluciones y deja una auditoría con el contenido", async () => {
    const id = await env.createDevolucion(users.devoluciones, "pesado", "malo");
    const denied = await rpc(
      users.devoluciones.client,
      "admin_eliminar_devolucion",
      {
        p_devolucion_id: id,
      },
    );
    expect(denied.error).toMatch(/FORBIDDEN_ROLE/);

    expect(
      await rpcOk(users.admin.client, "admin_eliminar_devolucion", {
        p_devolucion_id: id,
      }),
    ).toBe(true);
    const { data: audit } = await users.admin.client
      .from("devolucion_delete_audit")
      .select("snapshot, deleted_by")
      .eq("devolucion_id", id)
      .single();
    expect(audit?.deleted_by).toBe(users.admin.id);
    expect(audit?.snapshot).toHaveProperty("devolucion");
  });
});

describe("lectura filtrada por flujo (RLS)", () => {
  it("cada rol solo ve las devoluciones de su flujo", async () => {
    const pesado = await env.createDevolucion(
      users.devoluciones,
      "pesado",
      "bueno",
    );
    const almacen = await env.createDevolucion(
      users.devoluciones,
      "almacen",
      "bueno",
    );

    const visible = async (account: Account, id: string) => {
      const { data } = await account.client
        .from("devoluciones")
        .select("id")
        .eq("id", id);
      return (data ?? []).length === 1;
    };

    expect(await visible(users.pesado, pesado)).toBe(true);
    expect(await visible(users.pesado, almacen)).toBe(false);
    expect(await visible(users.almacen, almacen)).toBe(true);
    expect(await visible(users.almacen, pesado)).toBe(false);
    for (const role of ["transportes", "seguridad"] as const) {
      expect(await visible(users[role], pesado), role).toBe(false);
      expect(await visible(users[role], almacen), role).toBe(false);
    }
    expect(await visible(users.admin, pesado)).toBe(true);
  });

  it("nadie escribe directamente en las tablas operativas", async () => {
    const id = await env.createDevolucion(
      users.devoluciones,
      "pesado",
      "bueno",
    );
    for (const role of ["admin", "devoluciones", "pesado"] as const) {
      const { error } = await users[role].client
        .from("devoluciones")
        .update({ estado: "cerrada" })
        .eq("id", id);
      expect(error, role).not.toBeNull();
    }
    expect(await env.estado(id)).toBe("pendiente_entrega");
  });
});
