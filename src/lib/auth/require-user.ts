import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDefaultRoute } from "@/constants/permissions";
import { isUserRole, type UserRole } from "@/constants/roles";
import { securityEvent } from "@/lib/security/events";

export type ActiveProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: true;
};

export async function requireActiveProfile(): Promise<ActiveProfile> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string") {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,is_active")
    .eq("id", userId)
    .single();

  if (
    profileError ||
    !profile ||
    profile.is_active !== true ||
    !isUserRole(profile.role)
  ) {
    redirect("/login?error=inactive");
  }

  return profile as ActiveProfile;
}

export async function requireRole(
  allowedRoles: readonly UserRole[],
): Promise<ActiveProfile> {
  const profile = await requireActiveProfile();

  if (!allowedRoles.includes(profile.role)) {
    securityEvent("access.denied_role", { userId: profile.id });
    redirect(`${getDefaultRoute(profile.role)}?error=forbidden`);
  }

  return profile;
}
