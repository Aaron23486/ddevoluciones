// Entorno para las pruebas de integración: Supabase local en marcha (npm run db:up).
// Cada archivo crea sus propias cuentas con correos únicos y borra al final lo que registró,
// así las pruebas no dependen de demo:setup ni dejan datos en la base local.
import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { demoEvidencePng } from "../../scripts/lib/demo-data.mts";
import {
  adminClient,
  readLocalSupabase,
  setProfileAccess,
  signedInClient,
  type Role,
  type SupabaseTarget,
} from "../../scripts/lib/supabase-local.mts";

export type Account = {
  id: string;
  email: string;
  password: string;
  role: Role;
  client: SupabaseClient;
};

export type Flow = "pesado" | "almacen";
export type Classification = "bueno" | "malo" | "mixto";

export const BUCKET = "devoluciones";
export const RUN = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
export const PNG = demoEvidencePng([120, 120, 120], 16, 16);

let counter = 0;

// Referencias de prueba con prefijo IT- (las de demostración usan DEMO-).
export function testRef(label: string): string {
  counter += 1;
  return `IT-${RUN}-${label}-${counter}`;
}

// Resultado de una llamada RPC con el error ya normalizado a su mensaje.
export async function rpc<T = unknown>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await client.rpc(name, args);
  return { data: (data as T) ?? null, error: error?.message ?? null };
}

export async function rpcOk<T = unknown>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await rpc<T>(client, name, args);
  if (error) throw new Error(`${name}: ${error}`);
  return data as T;
}

export class TestEnvironment {
  readonly target: SupabaseTarget = readLocalSupabase();
  readonly service: SupabaseClient = adminClient(this.target);
  private readonly userIds: string[] = [];
  private readonly paths: string[] = [];

  // Crea una cuenta con el rol pedido; con keepDefault queda como la deja el trigger de Auth.
  async account(
    role: Role,
    { active = true, keepDefault = false } = {},
  ): Promise<Account> {
    const email = `it-${role}-${RUN}-${this.userIds.length}@example.test`;
    const password = `It-${randomBytes(12).toString("base64url")}1a`;
    const { data, error } = await this.service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Prueba ${role}` },
    });
    if (error || !data.user) throw error ?? new Error("Sin usuario");
    this.userIds.push(data.user.id);
    if (!keepDefault) {
      await setProfileAccess(this.service, data.user.id, { role, active });
    }
    const client = await signedInClient(this.target, email, password);
    return { id: data.user.id, email, password, role, client };
  }

  // Una cuenta activa por cada rol.
  async accounts(): Promise<Record<Role, Account>> {
    const roles: Role[] = [
      "admin",
      "devoluciones",
      "pesado",
      "inventario",
      "almacen",
      "transportes",
      "seguridad",
    ];
    const entries = [];
    for (const role of roles) entries.push([role, await this.account(role)]);
    return Object.fromEntries(entries) as Record<Role, Account>;
  }

  // Sube una evidencia a la carpeta del usuario, como hace la app.
  async upload(account: Account, folder = "it"): Promise<string> {
    const path = `${account.id}/${folder}/${RUN}-${randomBytes(4).toString("hex")}.png`;
    const { error } = await account.client.storage
      .from(BUCKET)
      .upload(path, PNG, { contentType: "image/png", upsert: false });
    if (error) throw new Error(`upload: ${error.message}`);
    this.paths.push(path);
    return path;
  }

  // Registra una devolución con la cuenta de devoluciones y devuelve su id.
  async createDevolucion(
    creator: Account,
    flow: Flow,
    classification: Classification,
    quantity = 4,
  ): Promise<string> {
    return rpcOk<string>(creator.client, "crear_devolucion", {
      p_factura: testRef(flow),
      p_articulo: "Articulo de prueba",
      p_cantidad: quantity,
      p_clasificacion: classification,
      p_descripcion: "Devolucion de prueba de integracion",
      p_flujo: flow,
      p_transportista_nombre: "Transportista Prueba",
      p_transportista_cedula: "0-0000-0000",
      p_placa_camion: "IT-000",
      p_factura_path: await this.upload(creator),
      p_material_path: await this.upload(creator),
    });
  }

  async estado(id: string): Promise<string> {
    const { data, error } = await this.service
      .from("devoluciones")
      .select("estado")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data.estado as string;
  }

  // Borra devoluciones, reportes, evidencias y cuentas de esta ejecución.
  async cleanup(): Promise<void> {
    await this.service
      .from("devoluciones")
      .delete()
      .like("factura", `IT-${RUN}%`);
    await this.service
      .from("reportes_carga")
      .delete()
      .like("numero_documento", `IT-${RUN}%`);
    if (this.paths.length) {
      await this.service.storage.from(BUCKET).remove(this.paths);
    }
    for (const id of this.userIds) {
      await this.service.auth.admin.deleteUser(id);
    }
  }
}
