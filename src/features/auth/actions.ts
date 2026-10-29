"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema } from "@/schemas/auth";

function loginRedirect(params: Record<string, string>): never {
  const search = new URLSearchParams(params);
  redirect(`/login?${search.toString()}`);
}

export async function signIn(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    loginRedirect({ error: "credentials" });
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signInError) {
    loginRedirect({ error: "credentials" });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    await supabase.auth.signOut();
    loginRedirect({ error: "credentials" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active,role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) {
    await supabase.auth.signOut();
    loginRedirect({ error: "inactive" });
  }

  redirect(
    profile?.role === "transportes" || profile?.role === "seguridad"
      ? "/reportes-carga"
      : "/dashboard",
  );
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
