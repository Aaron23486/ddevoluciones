import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.DEMO_USERS_PASSWORD;

if (!url || !key || !password) {
  throw new Error("Missing Supabase public variables or DEMO_USERS_PASSWORD");
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

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Login failed ${email}: ${error?.message ?? "no user"}`);
  }

  return { client, user: data.user };
}

const sessions = {};
for (const [role, email] of Object.entries(emails)) {
  sessions[role] = await login(email);
}

async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function expectRpcFailure(client, name, args = {}) {
  const { error } = await client.rpc(name, args);
  if (!error) throw new Error(`Expected ${name} to fail`);
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nL8AAAAASUVORK5CYII=",
  "base64",
);

const run = `E4-${Date.now()}`;
const uploadedPaths = [];
let reportId = null;

async function uploadEvidence(session, stage) {
  const path = `${session.user.id}/reportes-carga/${run}/${stage}.png`;
  const { error } = await session.client.storage
    .from("devoluciones")
    .upload(path, png, { contentType: "image/png", upsert: false });

  if (error) throw new Error(`Storage upload ${stage}: ${error.message}`);
  uploadedPaths.push(path);
  return path;
}

try {
  const receptionPath = await uploadEvidence(sessions.transportes, "recepcion");
  console.log("OK storage: transportes can upload report evidence");

  await expectRpcFailure(sessions.devoluciones.client, "crear_reporte_carga_ep4", {
    p_numero_documento: `${run}-FORBIDDEN`,
    p_factura: null,
    p_cliente: "Forbidden",
    p_articulo: "ART-X",
    p_descripcion_material: null,
    p_cantidad: 1,
    p_transportista: null,
    p_ruta: null,
    p_placa: null,
    p_motivo_no_entrega: "Test",
    p_estado_fisico_carga: "Buen estado",
    p_observaciones_retorno: null,
    p_evidencia_path: receptionPath,
  });
  console.log("OK permission: devoluciones cannot create Reporte de carga");

  reportId = await rpc(sessions.transportes.client, "crear_reporte_carga_ep4", {
    p_numero_documento: `${run}-DOC`,
    p_factura: `${run}-FAC`,
    p_cliente: "Cliente Demo Epica 4",
    p_articulo: "ART-E4",
    p_descripcion_material: "Carga demo",
    p_cantidad: 7,
    p_transportista: "Transportista Demo",
    p_ruta: "RUTA-E4",
    p_placa: "abc123",
    p_motivo_no_entrega: "Cliente ausente",
    p_estado_fisico_carga: "Buen estado",
    p_observaciones_retorno: "Retorno E2E",
    p_evidencia_path: receptionPath,
  });

  console.log(`OK create: ${reportId}`);

  const { data: report, error: reportError } = await sessions.transportes.client
    .from("reportes_carga")
    .select("id,estado,placa,is_active")
    .eq("id", reportId)
    .single();

  if (reportError) throw reportError;
  if (report.estado !== "pendiente_redespacho") {
    throw new Error(`Expected pendiente_redespacho, got ${report.estado}`);
  }
  if (report.placa !== "ABC123") {
    throw new Error(`Expected normalized plate ABC123, got ${report.placa}`);
  }
  console.log("OK state/history contract: created directly as pendiente_redespacho");

  const { data: history, error: historyError } = await sessions.transportes.client
    .from("reportes_carga_historial")
    .select("accion,estado_anterior,estado_nuevo")
    .eq("reporte_carga_id", reportId)
    .order("created_at", { ascending: true });

  if (historyError) throw historyError;
  if ((history ?? []).length < 2) throw new Error("Expected two creation history rows");
  if (history[0].estado_nuevo !== "recibido_muelle") {
    throw new Error("First history state must be recibido_muelle");
  }
  if (history[1].estado_nuevo !== "pendiente_redespacho") {
    throw new Error("Second history state must be pendiente_redespacho");
  }
  console.log("OK history: null -> recibido_muelle -> pendiente_redespacho");

  const transportNotifications = await rpc(
    sessions.transportes.client,
    "get_my_notifications_ep4",
    { p_limit: 50 },
  );

  const pendingNotification = (transportNotifications ?? []).find(
    (item) =>
      item.reporte_carga_id === reportId &&
      item.event_type === "reporte_carga_pendiente_envio",
  );

  if (!pendingNotification) {
    throw new Error("Transportes did not receive pending shipment notification");
  }
  console.log("OK notification: role-targeted pending shipment");

  await rpc(sessions.transportes.client, "mark_internal_notification_read_ep4", {
    p_notification_id: pendingNotification.id,
  });

  const readBack = await rpc(
    sessions.transportes.client,
    "get_my_notifications_ep4",
    { p_limit: 50 },
  );

  if (!(readBack ?? []).find((item) => item.id === pendingNotification.id)?.is_read) {
    throw new Error("Individual notification read was not persisted");
  }
  console.log("OK notification: individual read");

  await expectRpcFailure(sessions.transportes.client, "redespachar_reporte_carga_ep4", {
    p_reporte_carga_id: reportId,
    p_conductor: "Transportes forbidden",
    p_placa_salida: "TRP001",
    p_observaciones: "Should fail",
    p_evidencia_path: receptionPath,
  });
  console.log("OK permission: Transportes cannot redispatch in active original policy");

  const redispatchPath = await uploadEvidence(sessions.inventario, "redespacho");

  await rpc(sessions.inventario.client, "redespachar_reporte_carga_ep4", {
    p_reporte_carga_id: reportId,
    p_conductor: "Conductor E4",
    p_placa_salida: "sal123",
    p_observaciones: "Salida E2E confirmada",
    p_evidencia_path: redispatchPath,
  });

  const { data: sent, error: sentError } = await sessions.inventario.client
    .from("reportes_carga")
    .select("estado,conductor_envio,placa_envio,observaciones_redespacho")
    .eq("id", reportId)
    .single();

  if (sentError) throw sentError;
  if (sent.estado !== "redespachado") throw new Error("Report did not reach redespachado");
  if (sent.conductor_envio !== "Conductor E4") throw new Error("Driver not stored");
  if (sent.placa_envio !== "SAL123") throw new Error("Departure plate not normalized");
  console.log("OK redispatch: driver + plate + observations + redespachado");

  const securityNotifications = await rpc(
    sessions.seguridad.client,
    "get_my_notifications_ep4",
    { p_limit: 50 },
  );

  if (
    !(securityNotifications ?? []).some(
      (item) =>
        item.reporte_carga_id === reportId &&
        item.event_type === "reporte_carga_enviado",
    )
  ) {
    throw new Error("Seguridad did not receive sent notification");
  }
  console.log("OK notification: report sent routed to Seguridad");

  await rpc(sessions.seguridad.client, "mark_all_internal_notifications_read_ep4");
  const securityReadBack = await rpc(
    sessions.seguridad.client,
    "get_my_notifications_ep4",
    { p_limit: 50 },
  );

  if ((securityReadBack ?? []).some((item) => !item.is_read)) {
    throw new Error("Mark all notifications did not persist");
  }
  console.log("OK notification: mark all");

  const { data: hiddenFromDevoluciones, error: hiddenError } =
    await sessions.devoluciones.client
      .from("reportes_carga")
      .select("id")
      .eq("id", reportId);

  if (hiddenError) throw hiddenError;
  if ((hiddenFromDevoluciones ?? []).length !== 0) {
    throw new Error("Devoluciones unexpectedly has direct reportes_carga table visibility");
  }
  console.log("OK RLS: Devoluciones has no direct Reporte de carga table visibility");

  const analytics = await rpc(
    sessions.devoluciones.client,
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

  if (!analytics || typeof analytics.total !== "number") {
    throw new Error("Analytics RPC returned invalid contract");
  }
  if (
    !(analytics.casos ?? []).some(
      (item) => item.modulo === "reporte_carga" && item.id === reportId,
    )
  ) {
    throw new Error("Combined analytics did not include the active report");
  }
  console.log("OK analytics: combined Devoluciones + Reporte de carga");

  await expectRpcFailure(sessions.inventario.client, "anular_reporte_carga_ep4", {
    p_reporte_carga_id: reportId,
  });
  console.log("OK permission: only Admin can soft-delete");

  const annulled = await rpc(sessions.admin.client, "anular_reporte_carga_ep4", {
    p_reporte_carga_id: reportId,
  });

  if (annulled !== true) throw new Error("Admin soft-delete did not return true");

  const afterDelete = await rpc(
    sessions.transportes.client,
    "buscar_reportes_carga_ep4",
    {
      p_search: `${run}-DOC`,
      p_estado: null,
      p_desde: null,
      p_hasta: null,
      p_limit: 20,
      p_offset: 0,
    },
  );

  if ((afterDelete ?? []).some((item) => item.id === reportId)) {
    throw new Error("Soft-deleted report is still listed");
  }
  console.log("OK soft-delete: is_active=false and hidden from listings");

  console.log("Epic 4 remote verification passed");
} finally {
  if (reportId) {
    try {
      await sessions.admin.client.rpc("anular_reporte_carga_ep4", {
        p_reporte_carga_id: reportId,
      });
    } catch {
      // Best effort.
    }
  }

  if (uploadedPaths.length > 0) {
    try {
      await sessions.admin.client.storage
        .from("devoluciones")
        .remove(uploadedPaths);
    } catch {
      // Best effort storage cleanup.
    }
  }
}