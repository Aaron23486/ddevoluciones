import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { hardenSessionCookie } from "@/lib/supabase/cookie-options";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase no esta configurado. Revisa .env.local.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, hardenSessionCookie(options));
          });
        } catch {
          // Puede ejecutarse desde Server Component.
        }
      },
    },
  });
}
