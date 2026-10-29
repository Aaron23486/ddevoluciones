import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.DEMO_USERS_PASSWORD;

if (!url || !key || !password) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or DEMO_USERS_PASSWORD",
  );
}

const emails = {
  admin: "admin.demo@example.com",
  devoluciones: "devoluciones.demo@example.com",
  pesado: "pesado.demo@example.com",
  inventario: "inventario.demo@example.com",
  almacen: "almacen.demo@example.com",
  transportes: "transportes.demo@example.com",
  seguridad: "seguridad.demo@example.com",
};

async function login(email) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Login failed ${email}: ${error.message}`);
  return client;
}

const clients = {};
for (const [role, email] of Object.entries(emails)) {
  clients[role] = await login(email);
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function expectRpcFailure(client, name, args) {
  const { error } = await client.rpc(name, args);
  if (!error) throw new Error(`Expected ${name} to fail`);
}

const run = `E3-${Date.now()}`;
const created = [];

async function createCase(flow, classification, total, good, bad) {
  const id = await rpc(clients.devoluciones, "crear_devolucion", {
    p_factura: `${run}-${flow}-${classification}`,
    p_articulo: `ART-${classification}`,
    p_cantidad: total,
    p_clasificacion: classification,
    p_descripcion: `Smoke ${flow} ${classification}`,
    p_flujo: flow,
    p_transportista_nombre: "Demo Auditor",
    p_transportista_cedula: "DEMO",
    p_placa_camion: "DEMO",
    p_factura_path: `smoke/${run}/factura.jpg`,
    p_material_path: `smoke/${run}/material.jpg`,
  });

  created.push(id);

  if (flow === "pesado") {
    await rpc(clients.pesado, "confirmar_recepcion_devolucion", {
      p_devolucion_id: id,
      p_cantidad_recibida: total,
      p_clasificacion: classification,
      p_cantidad_bueno: good,
      p_cantidad_malo: bad,
      p_observaciones: "Smoke reception",
      p_factura_firmada_path: `smoke/${run}/firmada.jpg`,
      p_material_bueno_path:
        classification !== "malo" ? `smoke/${run}/bueno.jpg` : null,
      p_material_malo_path:
        classification !== "bueno" ? `smoke/${run}/malo.jpg` : null,
    });
  }

  await rpc(clients.inventario, "procesar_inventario_devolucion", {
    p_devolucion_id: id,
    p_pallet_codigo: `PALLET-${classification}`,
    p_observaciones: "Smoke inventory",
    p_evidencia_path: `smoke/${run}/pallet.jpg`,
    p_cantidad_bueno: flow === "almacen" ? good : null,
    p_cantidad_malo: flow === "almacen" ? bad : null,
  });

  const { data: materials, error: materialsError } = await clients.inventario
    .from("devolucion_materiales")
    .select("id,tipo_material,estado")
    .eq("devolucion_id", id);

  if (materialsError) throw materialsError;

  for (const material of materials ?? []) {
    if (material.tipo_material === "bueno") {
      const locator = flow === "pesado" ? clients.pesado : clients.almacen;
      await rpc(locator, "ubicar_material_devolucion", {
        p_material_id: material.id,
        p_ubicacion: `UBI-${classification}`,
        p_observaciones: "Smoke location",
        p_evidencia_path: null,
      });
    } else {
      await rpc(clients.inventario, "disponer_material_devolucion", {
        p_material_id: material.id,
        p_decision_final: "DISPOSICION DEMO",
        p_observaciones: "Smoke disposition",
        p_evidencia_path: `smoke/${run}/disposicion.jpg`,
      });
    }
  }

  const { data: closed, error: closedError } = await clients.devoluciones
    .from("devoluciones")
    .select("estado")
    .eq("id", id)
    .single();

  if (closedError) throw closedError;
  if (closed.estado !== "cerrada") {
    throw new Error(
      `${flow}/${classification} did not close; state=${closed.estado}`,
    );
  }

  console.log(`OK ${flow.padEnd(7)} ${classification.padEnd(5)} -> cerrada`);
}

try {
  await expectRpcFailure(clients.pesado, "crear_devolucion", {
    p_factura: "FORBIDDEN",
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
  console.log("OK permission: pesado cannot create devolucion");

  const { data: transportRows, error: transportError } =
    await clients.transportes.from("devoluciones").select("id").limit(1);
  if (transportError) throw transportError;
  if ((transportRows ?? []).length !== 0) {
    throw new Error("transportes unexpectedly sees devoluciones");
  }
  console.log("OK RLS: transportes cannot read devoluciones");

  const { data: securityRows, error: securityError } = await clients.seguridad
    .from("devoluciones")
    .select("id")
    .limit(1);
  if (securityError) throw securityError;
  if ((securityRows ?? []).length !== 0) {
    throw new Error("seguridad unexpectedly sees devoluciones");
  }
  console.log("OK RLS: seguridad cannot read devoluciones");

  await createCase("pesado", "bueno", 10, null, null);
  await createCase("pesado", "malo", 10, null, null);
  await createCase("pesado", "mixto", 10, 6, 4);
  await createCase("almacen", "bueno", 10, null, null);
  await createCase("almacen", "malo", 10, null, null);
  await createCase("almacen", "mixto", 10, 6, 4);

  await expectRpcFailure(clients.devoluciones, "admin_eliminar_devolucion", {
    p_devolucion_id: created[0],
  });
  console.log("OK permission: devoluciones cannot hard-delete");

  console.log(
    `Epic 3 remote verification passed: 6 flows + permission/RLS checks`,
  );
} finally {
  for (const id of created) {
    try {
      await clients.admin.rpc("admin_eliminar_devolucion", {
        p_devolucion_id: id,
      });
    } catch {
      // Best-effort cleanup.
    }
  }
}
