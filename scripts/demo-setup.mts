// Acceso y datos de demostración para una evaluación local: `npm run demo:setup`.
//
// - Crea (o reactiva) una cuenta por cada uno de los siete roles con una contraseña generada
//   que se muestra una sola vez. Al ejecutarlo de nuevo emite contraseñas nuevas.
// - La primera vez registra devoluciones ficticias en todas las etapas (Pesado y Almacén,
//   material bueno, malo y mixto) y reportes de carga pendientes y redespachados. Cada paso
//   lo hace la cuenta del rol que corresponde, con las mismas RPC, políticas y evidencias
//   privadas que usa la app.
// - Se niega a ejecutarse contra algo que no sea el Supabase local.
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEMO_ACCOUNTS,
  DEMO_ARTICLES,
  DEMO_CARRIERS,
  DEMO_CLIENTS,
  DEMO_DEVOLUCIONES,
  DEMO_HISTORY_DAYS,
  DEMO_REPORTES_CARGA,
  DEMO_ROUTES,
  demoEvidencePng,
  demoFactura,
  seededRandom,
  type DemoStage,
} from "./lib/demo-data.mts";
import { generateDemoPassword } from "./lib/passwords.mts";
import {
  adminClient,
  findAccountByEmail,
  resolveSupabaseTarget,
  setPassword,
  setProfileAccess,
  signedInClient,
  type Role,
} from "./lib/supabase-local.mts";

type Session = { client: SupabaseClient; userId: string };
type Sessions = Record<Role, Session>;
type Classification = "bueno" | "malo" | "mixto";

const BUCKET = "devoluciones";
const EVIDENCE_COLORS: Record<string, [number, number, number]> = {
  factura: [92, 107, 192],
  material: [38, 166, 154],
  firmada: [126, 87, 194],
  pallet: [251, 140, 0],
  ubicacion: [67, 160, 71],
  disposicion: [229, 57, 53],
  carga: [3, 155, 229],
  redespacho: [0, 137, 123],
};

function fail(step: string, error: { code?: string; message: string }): never {
  throw new Error(
    `${step} falló (${error.code ?? "sin código"}): ${error.message}`,
  );
}

async function upsertAccount(
  admin: SupabaseClient,
  account: { email: string; fullName: string; role: Role },
  password: string,
): Promise<string> {
  const existing = await findAccountByEmail(admin, account.email);
  let userId = existing?.id;
  if (userId) {
    await setPassword(admin, userId, password);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName },
    });
    if (error || !data.user) {
      throw new Error(
        `No fue posible preparar ${account.email}: ${error?.message}`,
      );
    }
    userId = data.user.id;
  }
  await setProfileAccess(admin, userId, { role: account.role, active: true });
  return userId;
}

// Sube una imagen de relleno a la carpeta del usuario, como hace la app.
async function evidence(
  session: Session,
  folder: string,
  stage: keyof typeof EVIDENCE_COLORS,
): Promise<string> {
  const path = `${session.userId}/${folder}/${stage}-${crypto.randomUUID()}.png`;
  const { error } = await session.client.storage
    .from(BUCKET)
    .upload(path, demoEvidencePng(EVIDENCE_COLORS[stage]), {
      contentType: "image/png",
      upsert: false,
    });
  if (error) fail(`Evidencia ${stage}`, error);
  return path;
}

async function call<T>(
  session: Session,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await session.client.rpc(name, args);
  if (error) fail(name, error);
  return data as T;
}

async function createDevolucion(
  s: Sessions,
  sequence: number,
  random: () => number,
): Promise<{ id: string; flow: "pesado" | "almacen"; stage: DemoStage }> {
  const pick = <T,>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)];
  const flow = sequence % 2 === 0 ? "pesado" : "almacen";
  const classification = pick<Classification>(["bueno", "malo", "mixto"]);
  const stage = pick<DemoStage>([
    "registrada",
    "recibida",
    "en_proceso",
    "cerrada",
    "cerrada",
  ]);
  const quantity = 2 + Math.floor(random() * 8);
  const good =
    classification === "mixto"
      ? Math.max(1, Math.floor(quantity / 2))
      : classification === "bueno"
        ? quantity
        : 0;
  const bad = quantity - good;
  const carrier = pick(DEMO_CARRIERS);
  const folder = `demo-${sequence}`;
  const creator = s.devoluciones;

  const id = await call<string>(creator, "crear_devolucion", {
    p_factura: demoFactura(sequence),
    p_articulo: pick(DEMO_ARTICLES),
    p_cantidad: quantity,
    p_clasificacion: classification,
    p_descripcion: `Devolucion de demostracion ${sequence}: material ${classification}.`,
    p_flujo: flow,
    p_transportista_nombre: carrier.name,
    p_transportista_cedula: carrier.id,
    p_placa_camion: `DM-${100 + sequence}`,
    p_factura_path: await evidence(creator, folder, "factura"),
    p_material_path: await evidence(creator, folder, "material"),
  });
  if (stage === "registrada") return { id, flow, stage };

  if (flow === "pesado") {
    await call(s.pesado, "confirmar_recepcion_devolucion", {
      p_devolucion_id: id,
      p_cantidad_recibida: quantity,
      p_clasificacion: classification,
      p_cantidad_bueno: classification === "mixto" ? good : null,
      p_cantidad_malo: classification === "mixto" ? bad : null,
      p_observaciones: "Recepcion fisica de demostracion.",
      p_factura_firmada_path: await evidence(s.pesado, folder, "firmada"),
      p_material_bueno_path:
        good > 0 ? await evidence(s.pesado, folder, "material") : null,
      p_material_malo_path:
        bad > 0 ? await evidence(s.pesado, folder, "material") : null,
    });
    if (stage === "recibida") return { id, flow, stage };
  }

  await call(s.inventario, "procesar_inventario_devolucion", {
    p_devolucion_id: id,
    p_pallet_codigo: `PAL-${String(sequence).padStart(3, "0")}`,
    p_observaciones: "Inventario de demostracion.",
    p_evidencia_path: await evidence(s.inventario, folder, "pallet"),
    p_cantidad_bueno: flow === "almacen" ? good : null,
    p_cantidad_malo: flow === "almacen" ? bad : null,
  });
  if (stage !== "cerrada") return { id, flow, stage };

  const { data: materials, error } = await s.inventario.client
    .from("devolucion_materiales")
    .select("id, tipo_material")
    .eq("devolucion_id", id);
  if (error) fail("Lectura de materiales", error);

  for (const material of materials ?? []) {
    if (material.tipo_material === "bueno") {
      const locator = flow === "pesado" ? s.pesado : s.almacen;
      await call(locator, "ubicar_material_devolucion", {
        p_material_id: material.id,
        p_ubicacion: `A-${1 + Math.floor(random() * 9)}-${1 + Math.floor(random() * 4)}`,
        p_observaciones: "Ubicado en bodega de demostracion.",
        p_evidencia_path: await evidence(locator, folder, "ubicacion"),
      });
    } else {
      await call(s.inventario, "disponer_material_devolucion", {
        p_material_id: material.id,
        p_decision_final: pick(["Destruccion", "Reciclaje", "Donacion"]),
        p_observaciones: "Disposicion de demostracion.",
        p_evidencia_path: await evidence(s.inventario, folder, "disposicion"),
      });
    }
  }
  return { id, flow, stage };
}

async function createReporteCarga(
  s: Sessions,
  sequence: number,
  random: () => number,
): Promise<string> {
  const pick = <T,>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)];
  const author = pick([s.transportes, s.seguridad, s.inventario]);
  const folder = `reportes-carga/demo-${sequence}`;

  const id = await call<string>(author, "crear_reporte_carga_ep4", {
    p_numero_documento: `DOC-DEMO-${String(sequence).padStart(4, "0")}`,
    p_factura: demoFactura(500 + sequence),
    p_cliente: pick(DEMO_CLIENTS),
    p_articulo: pick(DEMO_ARTICLES),
    p_descripcion_material: "Carga retornada de demostracion.",
    p_cantidad: 1 + Math.floor(random() * 12),
    p_transportista: pick(DEMO_CARRIERS).name,
    p_ruta: pick(DEMO_ROUTES),
    p_placa: `CR-${200 + sequence}`,
    p_motivo_no_entrega: pick([
      "Cliente ausente",
      "Direccion incorrecta",
      "Rechazo por empaque",
    ]),
    p_estado_fisico_carga: pick(["Buen estado", "Mal estado"]),
    p_observaciones_retorno: "Retorno registrado en muelle.",
    p_evidencia_path: await evidence(author, folder, "carga"),
  });

  if (sequence % 3 !== 0) {
    await call(s.inventario, "redespachar_reporte_carga_ep4", {
      p_reporte_carga_id: id,
      p_conductor: pick(DEMO_CARRIERS).name,
      p_placa_salida: `RS-${300 + sequence}`,
      p_observaciones: "Redespacho confirmado.",
      p_evidencia_path: await evidence(s.inventario, folder, "redespacho"),
    });
  }
  return id;
}

// Reparte las fechas de registro en los últimos meses para que el dashboard tenga historia.
async function spreadDates(
  admin: SupabaseClient,
  table: "devoluciones" | "reportes_carga",
  ids: string[],
  random: () => number,
): Promise<void> {
  for (const id of ids) {
    const daysAgo = Math.floor(random() * DEMO_HISTORY_DAYS);
    const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    const values =
      table === "reportes_carga"
        ? { created_at: date, recibido_at: date }
        : { created_at: date };
    const { error } = await admin.from(table).update(values).eq("id", id);
    if (error) fail(`Fechas de ${table}`, error);
  }
}

async function main(): Promise<void> {
  const target = resolveSupabaseTarget();
  if (!target.local) {
    throw new Error(
      "demo:setup solo se ejecuta contra el Supabase local (npm run db:up).",
    );
  }
  const admin = adminClient(target);

  const passwords = new Map<string, string>();
  const sessions = {} as Sessions;
  for (const account of DEMO_ACCOUNTS) {
    const password = generateDemoPassword();
    const userId = await upsertAccount(admin, account, password);
    passwords.set(account.email, password);
    sessions[account.role] = {
      client: await signedInClient(target, account.email, password),
      userId,
    };
  }

  const { count, error } = await admin
    .from("devoluciones")
    .select("id", { count: "exact", head: true })
    .like("factura", "DEMO-%");
  if (error) fail("Lectura de devoluciones", error);

  if (!count) {
    const random = seededRandom(2026);
    const devoluciones: string[] = [];
    for (let i = 1; i <= DEMO_DEVOLUCIONES; i++) {
      devoluciones.push((await createDevolucion(sessions, i, random)).id);
    }
    const reportes: string[] = [];
    for (let i = 1; i <= DEMO_REPORTES_CARGA; i++) {
      reportes.push(await createReporteCarga(sessions, i, random));
    }
    await spreadDates(admin, "devoluciones", devoluciones, random);
    await spreadDates(admin, "reportes_carga", reportes, random);
    console.log(
      `Datos creados: ${devoluciones.length} devoluciones y ${reportes.length} reportes de carga.`,
    );
  } else {
    console.log(
      "Los datos de demostración ya existían; solo se renovaron las contraseñas.",
    );
  }

  console.log(
    "\nCuentas de demostración (las contraseñas se muestran una sola vez):",
  );
  for (const account of DEMO_ACCOUNTS) {
    console.log(
      `  ${account.role.padEnd(12)} ${account.email.padEnd(32)} ${passwords.get(account.email)}`,
    );
  }
  console.log("\nAbre http://localhost:3000 después de `npm run dev`.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
