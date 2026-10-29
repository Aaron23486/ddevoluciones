// Content Security Policy por solicitud. Los scripts solo se ejecutan con el nonce de la
// respuesta ('strict-dynamic' extiende la confianza a lo que esos scripts cargan); no se
// permite JavaScript inline sin nonce. Los estilos conservan 'unsafe-inline' porque la UI y
// los gráficos usan atributos style, que un nonce no cubre.
//
// El navegador nunca habla con Supabase: datos, RPC y evidencias pasan por el servidor, así
// que connect-src se limita al propio origen.

export type CspOptions = {
  nonce: string;
  isDevelopment: boolean;
};

export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64",
  );
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
}: CspOptions): string {
  return [
    "default-src 'self'",
    // React necesita eval solo en desarrollo para reconstruir pilas de error.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // blob: para la vista previa de las evidencias antes de subirlas.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDevelopment ? " ws: http: https:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
