"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { USER_ROLES } from "@/constants/roles";
import { requireRole } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const roleSchema = z.enum(USER_ROLES);

function usersRedirect(params: Record<string, string>): never {
  const search = new URLSearchParams(params);
  redirect(`/usuarios?${search.toString()}`);
}

export async function approveAccessRequest(formData: FormData) {
  await requireRole(["admin"]);

  const requestId = uuidSchema.safeParse(formData.get("requestId"));
  const role = roleSchema.safeParse(formData.get("role"));
  const adminNotes = String(formData.get("adminNotes") ?? "").trim();

  if (!requestId.success || !role.success) {
    usersRedirect({ error: "invalid_input" });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_user_access_request", {
    p_request_id: requestId.data,
    p_role: role.data,
    p_admin_notes: adminNotes || null,
  });

  if (error) {
    usersRedirect({ error: "approve_failed" });
  }

  revalidatePath("/usuarios");
  usersRedirect({ success: "approved" });
}

export async function rejectAccessRequest(formData: FormData) {
  await requireRole(["admin"]);

  const requestId = uuidSchema.safeParse(formData.get("requestId"));
  const adminNotes = String(formData.get("adminNotes") ?? "").trim();

  if (!requestId.success) {
    usersRedirect({ error: "invalid_input" });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_user_access_request", {
    p_request_id: requestId.data,
    p_admin_notes: adminNotes || null,
  });

  if (error) {
    usersRedirect({ error: "reject_failed" });
  }

  revalidatePath("/usuarios");
  usersRedirect({ success: "rejected" });
}

export async function setUserActive(formData: FormData) {
  await requireRole(["admin"]);

  const userId = uuidSchema.safeParse(formData.get("userId"));
  const active = String(formData.get("active")) === "true";

  if (!userId.success) {
    usersRedirect({ error: "invalid_input" });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_active", {
    p_user_id: userId.data,
    p_is_active: active,
  });

  if (error) {
    usersRedirect({ error: "active_failed" });
  }

  revalidatePath("/usuarios");
  usersRedirect({ success: active ? "activated" : "deactivated" });
}

export async function setUserRole(formData: FormData) {
  await requireRole(["admin"]);

  const userId = uuidSchema.safeParse(formData.get("userId"));
  const role = roleSchema.safeParse(formData.get("role"));

  if (!userId.success || !role.success) {
    usersRedirect({ error: "invalid_input" });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_role", {
    p_user_id: userId.data,
    p_role: role.data,
  });

  if (error) {
    usersRedirect({ error: "role_failed" });
  }

  revalidatePath("/usuarios");
  usersRedirect({ success: "role_changed" });
}
