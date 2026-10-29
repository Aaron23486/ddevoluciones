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
