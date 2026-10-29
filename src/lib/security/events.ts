import { createHash } from "node:crypto";

// Eventos de seguridad del servidor, una línea JSON por evento en la salida de errores, para
// que el entorno de despliegue los recoja. Nunca llevan contraseñas, tokens ni correos en
// claro: el correo se identifica con una huella que permite agrupar intentos.

export type SecurityEventName =
  | "login.failed"
  | "login.denied_inactive"
  | "login.denied_without_profile"
  | "access.denied_role";

export type SecurityEventDetails = {
  userId?: string;
  emailFingerprint?: string;
};

export function emailFingerprint(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

export function securityEvent(
  name: SecurityEventName,
  details: SecurityEventDetails = {},
): string {
  const line = JSON.stringify({
    type: "security",
    event: name,
    at: new Date().toISOString(),
    ...details,
  });
  console.warn(line);
  return line;
}
