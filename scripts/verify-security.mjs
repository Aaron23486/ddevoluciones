import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.DEMO_USERS_PASSWORD;

if (!url || !key || !password) {
  throw new Error("Missing security-verification environment variables.");
}

const USERS = {
  admin: "admin.demo@example.com",
  devoluciones: "devoluciones.demo@example.com",
  pesado: "pesado.demo@example.com",
  inventario: "inventario.demo@example.com",
  almacen: "almacen.demo@example.com",
  transportes: "transportes.demo@example.com",
  seguridad: "seguridad.demo@example.com",
};

const sessions = {};
const createdDevoluciones = [];
const uploadedPaths = [];
const run = crypto.randomUUID().slice(0, 8);

function client() {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function login(role, email) {
  const c = client();

  const { data, error } = await c.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    throw new Error(
      `LOGIN ${role}: ${error?.message ?? "no user"}`,
    );
  }

  sessions[role] = {
    client: c,
    user: data.user,
  };

  console.log(`OK login: ${role}`);
}

async function expectRpcDenied(role, rpc, args) {
  const { error } = await sessions[role].client.rpc(rpc, args);

  if (!error) {
    throw new Error(
      `SECURITY FAILURE: ${role} executed ${rpc}`,
    );
  }

  console.log(`OK deny RPC: ${role} -> ${rpc}`);
}

async function expectNoRows(label, promise) {
  const { data, error } = await promise;

  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }

  if ((data ?? []).length !== 0) {
    throw new Error(
      `SECURITY FAILURE: ${label} returned protected rows`,
    );
  }

  console.log(`OK IDOR: ${label}`);
}

async function createDevolucion(flow, suffix) {
  const { data, error } =
    await sessions.devoluciones.client.rpc(
      "crear_devolucion",
      {
        p_factura: `SEC-${run}-${suffix}`,
        p_articulo: `SECURITY-${suffix}`,
        p_cantidad: 1,
        p_clasificacion: "bueno",
        p_descripcion: "Security verification",
        p_flujo: flow,
        p_transportista_nombre: "DEMO",
        p_transportista_cedula: "DEMO",
        p_placa_camion: "SEC001",
        p_factura_path:
          `security-audit/${run}/${suffix}-factura.jpg`,
        p_material_path:
          `security-audit/${run}/${suffix}-material.jpg`,
      },
    );

  if (error || !data) {
    throw new Error(
      `Could not create ${flow} security case: ` +
      `${error?.message ?? "no id"}`,
    );
  }

  createdDevoluciones.push(data);
  return data;
}

async function upload(role, path) {
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xd9,
  ]);

  const { error } =
    await sessions[role].client.storage
      .from("devoluciones")
      .upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });

  if (error) {
    throw new Error(
      `UPLOAD ${role}: ${error.message}`,
    );
  }

  uploadedPaths.push(path);
}

async function cleanupStorage(path) {
  try {
    await sessions.admin.client.storage
      .from("devoluciones")
      .remove([path]);
  } catch {
    // Best effort cleanup.
  }
}

try {
  console.log("");
  console.log("==============================================");
  console.log(" EPICA 6 - SECURITY / IDOR / ESCALATION");
  console.log("==============================================");

  for (const [role, email] of Object.entries(USERS)) {
    await login(role, email);
  }

  const ids = Object.fromEntries(
    Object.entries(sessions).map(
      ([role, session]) => [role, session.user.id],
    ),
  );

  // ========================================================
  // 1. PROFILE IDOR
  // ========================================================

  console.log("");
  console.log("[1/6] PROFILE IDOR");

  await expectNoRows(
    "devoluciones cannot read admin profile",
    sessions.devoluciones.client
      .from("profiles")
      .select("id,role")
      .eq("id", ids.admin),
  );

  await expectNoRows(
    "pesado cannot read inventario profile",
    sessions.pesado.client
      .from("profiles")
      .select("id,role")
      .eq("id", ids.inventario),
  );

  // ========================================================
  // 2. ROLE / ACTIVE ESCALATION
  // ========================================================

  console.log("");
  console.log("[2/6] PRIVILEGE ESCALATION");

  {
    const { error } =
      await sessions.devoluciones.client.rpc(
        "admin_set_user_role",
        {
          p_user_id: ids.devoluciones,
          p_role: "admin",
        },
      );

    if (!error) {
      await sessions.admin.client.rpc(
        "admin_set_user_role",
        {
          p_user_id: ids.devoluciones,
          p_role: "devoluciones",
        },
      );

      throw new Error(
        "SECURITY FAILURE: devoluciones self-promoted to admin",
      );
    }

    console.log(
      "OK escalation: devoluciones cannot become admin",
    );
  }

  {
    const { error } =
      await sessions.devoluciones.client.rpc(
        "admin_set_user_active",
        {
          p_user_id: ids.devoluciones,
          p_is_active: false,
        },
      );

    if (!error) {
      await sessions.admin.client.rpc(
        "admin_set_user_active",
        {
          p_user_id: ids.devoluciones,
          p_is_active: true,
        },
      );

      throw new Error(
        "SECURITY FAILURE: non-admin executed admin_set_user_active",
      );
    }

    console.log(
      "OK escalation: non-admin cannot change active state",
    );
  }

  {
    const { error } =
      await sessions.devoluciones.client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", ids.devoluciones);

    if (!error) {
      await sessions.admin.client.rpc(
        "admin_set_user_role",
        {
          p_user_id: ids.devoluciones,
          p_role: "devoluciones",
        },
      );

      throw new Error(
        "SECURITY FAILURE: direct profile UPDATE succeeded",
      );
    }

    console.log(
      "OK direct write: profiles UPDATE blocked",
    );
  }

  // ========================================================
  // 3. RPC ROLE MATRIX
  // ========================================================

  console.log("");
  console.log("[3/6] RPC ROLE MATRIX");

  const randomId = crypto.randomUUID();

  for (const role of [
    "pesado",
    "inventario",
    "almacen",
    "transportes",
    "seguridad",
  ]) {
    await expectRpcDenied(role, "crear_devolucion", {
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
  }

  await expectRpcDenied(
    "inventario",
    "confirmar_recepcion_devolucion",
    {
      p_devolucion_id: randomId,
      p_cantidad_recibida: 1,
      p_clasificacion: "bueno",
      p_cantidad_bueno: null,
      p_cantidad_malo: null,
      p_observaciones: null,
      p_factura_firmada_path: "x",
      p_material_bueno_path: "x",
      p_material_malo_path: null,
    },
  );

  await expectRpcDenied(
    "pesado",
    "procesar_inventario_devolucion",
    {
      p_devolucion_id: randomId,
      p_pallet_codigo: "X",
      p_observaciones: null,
      p_evidencia_path: "x",
      p_cantidad_bueno: null,
      p_cantidad_malo: null,
    },
  );

  await expectRpcDenied(
    "inventario",
    "ubicar_material_devolucion",
    {
      p_material_id: randomId,
      p_ubicacion: "X",
      p_observaciones: null,
      p_evidencia_path: null,
    },
  );

  await expectRpcDenied(
    "pesado",
    "disponer_material_devolucion",
    {
      p_material_id: randomId,
      p_decision_final: "X",
      p_observaciones: "X",
      p_evidencia_path: "x",
    },
  );

  await expectRpcDenied(
    "transportes",
    "redespachar_reporte_carga_ep4",
    {
      p_reporte_carga_id: randomId,
      p_conductor: "X",
      p_placa_salida: "X",
      p_observaciones: "X",
      p_evidencia_path: "x",
    },
  );

  await expectRpcDenied(
    "inventario",
    "anular_reporte_carga_ep4",
    {
      p_reporte_carga_id: randomId,
    },
  );

  await expectRpcDenied(
    "inventario",
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

  // ========================================================
  // 4. CROSS-FLOW IDOR
  // ========================================================

  console.log("");
  console.log("[4/6] DEVOLUCIONES CROSS-FLOW IDOR");

  const pesadoId =
    await createDevolucion("pesado", "PESADO");

  const almacenId =
    await createDevolucion("almacen", "ALMACEN");

  await expectNoRows(
    "Pesado cannot read Almacen devolucion by UUID",
    sessions.pesado.client
      .from("devoluciones")
      .select("id")
      .eq("id", almacenId),
  );

  await expectNoRows(
    "Almacen cannot read Pesado devolucion by UUID",
    sessions.almacen.client
      .from("devoluciones")
      .select("id")
      .eq("id", pesadoId),
  );

  await expectNoRows(
    "Transportes cannot read Devoluciones by UUID",
    sessions.transportes.client
      .from("devoluciones")
      .select("id")
      .eq("id", pesadoId),
  );

  await expectNoRows(
    "Seguridad cannot read Devoluciones by UUID",
    sessions.seguridad.client
      .from("devoluciones")
      .select("id")
      .eq("id", pesadoId),
  );

  await expectNoRows(
    "Pesado cannot read Almacen evidence metadata",
    sessions.pesado.client
      .from("devolucion_evidencias")
      .select("id")
      .eq("devolucion_id", almacenId),
  );

  {
    const { error } =
      await sessions.devoluciones.client
        .from("devoluciones")
        .update({ estado: "cerrada" })
        .eq("id", pesadoId);

    if (!error) {
      throw new Error(
        "SECURITY FAILURE: direct devoluciones UPDATE succeeded",
      );
    }

    console.log(
      "OK direct write: devoluciones UPDATE blocked",
    );
  }

  await expectRpcDenied(
    "devoluciones",
    "admin_eliminar_devolucion",
    {
      p_devolucion_id: pesadoId,
    },
  );

  // ========================================================
  // 5. STORAGE MODULE ISOLATION
  // ========================================================

  console.log("");
  console.log("[5/6] STORAGE ISOLATION");

  const devPath =
    `${ids.devoluciones}/security-${run}/unreferenced.jpg`;

  const reportPath =
    `${ids.transportes}/reportes-carga/security-${run}.jpg`;

  await upload("devoluciones", devPath);
  await upload("transportes", reportPath);

  {
    const { error } =
      await sessions.transportes.client.storage
        .from("devoluciones")
        .download(devPath);

    if (!error) {
      throw new Error(
        "SECURITY FAILURE: Transportes downloaded Devoluciones evidence",
      );
    }

    console.log(
      "OK Storage: Transportes cannot read Devoluciones evidence",
    );
  }

  {
    const { error } =
      await sessions.devoluciones.client.storage
        .from("devoluciones")
        .download(reportPath);

    if (!error) {
      throw new Error(
        "SECURITY FAILURE: Devoluciones downloaded Reporte evidence",
      );
    }

    console.log(
      "OK Storage: Devoluciones cannot read Reporte evidence",
    );
  }

  {
    const { error } =
      await sessions.devoluciones.client.storage
        .from("devoluciones")
        .remove([devPath]);

    if (error) {
      throw new Error(
        `Own unreferenced cleanup failed: ${error.message}`,
      );
    }

    console.log(
      "OK Storage: uploader can remove unreferenced failed upload",
    );
  }

  {
    const { error } =
      await sessions.transportes.client.storage
        .from("devoluciones")
        .remove([reportPath]);

    if (error) {
      throw new Error(
        `Report unreferenced cleanup failed: ${error.message}`,
      );
    }

    console.log(
      "OK Storage: report uploader can remove unreferenced upload",
    );
  }

  // ========================================================
  // 6. REFERENCED EVIDENCE IMMUTABILITY
  // ========================================================

  console.log("");
  console.log("[6/6] REFERENCED EVIDENCE PROTECTION");

  const refFactura =
    `${ids.devoluciones}/security-${run}/factura.jpg`;

  const refMaterial =
    `${ids.devoluciones}/security-${run}/material.jpg`;

  await upload("devoluciones", refFactura);
  await upload("devoluciones", refMaterial);

  const { data: referencedId, error: referencedError } =
    await sessions.devoluciones.client.rpc(
      "crear_devolucion",
      {
        p_factura: `SEC-${run}-STORAGE`,
        p_articulo: "SECURITY-STORAGE",
        p_cantidad: 1,
        p_clasificacion: "bueno",
        p_descripcion: "Referenced evidence security test",
        p_flujo: "pesado",
        p_transportista_nombre: "DEMO",
        p_transportista_cedula: "DEMO",
        p_placa_camion: "SEC002",
        p_factura_path: refFactura,
        p_material_path: refMaterial,
      },
    );

  if (referencedError || !referencedId) {
    throw new Error(
      `Could not create referenced evidence case: ` +
      `${referencedError?.message ?? "no id"}`,
    );
  }

  createdDevoluciones.push(referencedId);

  // Attempt deletion as original uploader.
  // Whether Storage returns an explicit error or silently affects
  // zero rows, the object MUST remain downloadable afterwards.
  await sessions.devoluciones.client.storage
    .from("devoluciones")
    .remove([refFactura]);

  const { error: stillExistsError } =
    await sessions.devoluciones.client.storage
      .from("devoluciones")
      .download(refFactura);

  if (stillExistsError) {
    throw new Error(
      "SECURITY FAILURE: referenced evidence was deleted by uploader",
    );
  }

  console.log(
    "OK Storage: referenced evidence cannot be deleted by uploader",
  );

  console.log("");
  console.log("==============================================");
  console.log(" EPICA 6 SECURITY MATRIX PASSED");
  console.log("==============================================");
}
finally {
  // Restore any test account state defensively.
  if (sessions.admin) {
    try {
      await sessions.admin.client.rpc(
        "admin_set_user_role",
        {
          p_user_id: sessions.devoluciones?.user.id,
          p_role: "devoluciones",
        },
      );
    } catch {}

    try {
      await sessions.admin.client.rpc(
        "admin_set_user_active",
        {
          p_user_id: sessions.devoluciones?.user.id,
          p_is_active: true,
        },
      );
    } catch {}

    for (const id of createdDevoluciones) {
      try {
        await sessions.admin.client.rpc(
          "admin_eliminar_devolucion",
          {
            p_devolucion_id: id,
          },
        );
      } catch {}
    }

    for (const path of uploadedPaths) {
      await cleanupStorage(path);
    }
  }

  for (const session of Object.values(sessions)) {
    try {
      await session.client.auth.signOut();
    } catch {}
  }
}