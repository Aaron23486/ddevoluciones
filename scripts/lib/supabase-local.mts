import { execFileSync } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseTarget = {
  url: string;
  publishableKey: string;
  secretKey: string;
  local: boolean;
};

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

// Lee la URL y las claves que la CLI generó para el Supabase local (`npm run db:up`).
// Las claves nunca se copian a mano ni se guardan en el repositorio.
export function readLocalSupabase(): SupabaseTarget {
  let output: string;
  try {
    output = execFileSync(
      "npx",
      ["--no-install", "supabase", "status", "-o", "json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );
  } catch {
    throw new Error(
      "Supabase local no está en marcha. Ejecuta primero: npm run db:up",
    );
  }

  const status = JSON.parse(output.slice(output.indexOf("{"))) as Record<
    string,
    string
  >;
  const url = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      "La salida de `supabase status` no contiene la URL y las claves esperadas.",
    );
  }

  return { url, publishableKey, secretKey, local: true };
}

// Supabase local por defecto. Para un proyecto alojado se definen SUPABASE_URL,
// SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY en la terminal que ejecuta el comando;
// la clave secreta nunca se lee de .env.local, que carga la app web.
export function resolveSupabaseTarget(): SupabaseTarget {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } =
    process.env;

  if (SUPABASE_URL || SUPABASE_SECRET_KEY) {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
      throw new Error(
        "Para un proyecto remoto define SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY.",
      );
    }
    return {
      url: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY,
      secretKey: SUPABASE_SECRET_KEY,
      local: isLocalUrl(SUPABASE_URL),
    };
  }

  return readLocalSupabase();
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

// Cliente con la clave secreta: API de administración de Auth y cambios de perfil.
export function adminClient(target: SupabaseTarget): SupabaseClient {
  return createClient(target.url, target.secretKey, clientOptions);
}

// Cliente con la sesión de un usuario: los datos pasan por las mismas RPC y políticas que la app.
export async function signedInClient(
  target: SupabaseTarget,
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(target.url, target.publishableKey, clientOptions);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `No fue posible iniciar sesión como ${email}: ${error.message}`,
    );
  }
  return client;
}

export type AuthAccount = { id: string; email: string };

// La API de administración de Auth lista las cuentas por páginas.
export async function findAccountByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<AuthAccount | null> {
  const wanted = email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw new Error(`No fue posible consultar las cuentas: ${error.message}`);
    }
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === wanted,
    );
    if (match) return { id: match.id, email: match.email ?? email };
    if (data.users.length < 200) return null;
  }
}

// Cambia la contraseña con la función de terminal: la base rechaza cualquier otro cambio de
// contraseña, también el de la API de administración de Auth. Cierra además las sesiones
// abiertas de la cuenta.
export async function setPassword(
  admin: SupabaseClient,
  userId: string,
  password: string,
): Promise<void> {
  const { error } = await admin.rpc("terminal_set_password", {
    p_user_id: userId,
    p_password: password,
  });
  if (error) {
    throw new Error(
      `No fue posible cambiar la contraseña (${error.code ?? "sin código"}).`,
    );
  }
}

export const ROLES = [
  "admin",
  "devoluciones",
  "pesado",
  "inventario",
  "almacen",
  "transportes",
  "seguridad",
] as const;
export type Role = (typeof ROLES)[number];

export type ProfileAccess = { role: Role; active: boolean };

// Fija rol y estado del perfil. La base rechaza dejar el sistema sin un admin activo
// y registra el cambio en profile_access_events.
export async function setProfileAccess(
  admin: SupabaseClient,
  userId: string,
  access: ProfileAccess,
): Promise<boolean> {
  const { data: current, error: readError } = await admin
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (readError || !current) {
    throw new Error("La cuenta no tiene perfil en public.profiles.");
  }
  if (current.role === access.role && current.is_active === access.active) {
    return false;
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: access.role, is_active: access.active })
    .eq("id", userId);
  if (error) {
    if (error.message.includes("LAST_ADMIN_REQUIRED")) {
      throw new Error("No se puede retirar el último admin activo.");
    }
    throw new Error(
      `No fue posible actualizar el acceso (${error.code ?? "sin código"}).`,
    );
  }
  return true;
}
