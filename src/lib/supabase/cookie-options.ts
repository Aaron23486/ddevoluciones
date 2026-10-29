import type { CookieOptions } from "@supabase/ssr";

// La sesión de Supabase solo la usa el servidor (Server Components, Server Actions y el
// proxy), así que su cookie es httpOnly: un script en el navegador no puede leerla. Viaja solo
// por https en producción y vive lo mismo que la sesión de Auth (12 h).
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

// @supabase/ssr escribe maxAge de 400 días; aquí se reemplaza por la vida de la sesión.
// maxAge 0 (borrar la cookie) se respeta.
export function hardenSessionCookie(
  options: CookieOptions = {},
): CookieOptions {
  return {
    ...options,
    path: options.path ?? "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: options.maxAge === 0 ? 0 : SESSION_MAX_AGE_SECONDS,
  };
}
