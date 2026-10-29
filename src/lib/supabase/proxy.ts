import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { hardenSessionCookie } from "@/lib/supabase/cookie-options";

// Valida y renueva la sesión en cada solicitud. requestHeaders lleva la CSP con el nonce
// para que Next.js lo aplique a sus scripts.
export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse> {
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request: { headers: requestHeaders } });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, hardenSessionCookie(options));
        });
      },
    },
  });

  // Valida el JWT; getSession() no sirve para proteger rutas.
  await supabase.auth.getClaims();

  return response;
}
