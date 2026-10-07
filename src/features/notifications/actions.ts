"use server";

import { revalidatePath } from "next/cache";
import { requireActiveProfile } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationReadAction(formData: FormData) {
  await requireActiveProfile();
  const id = String(formData.get("notificationId") ?? "");

  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_internal_notification_read_ep4", {
    p_notification_id: id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction() {
  await requireActiveProfile();

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_internal_notifications_read_ep4");

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
/**
 * Removes notices from this user's inbox display.
 * Other users, operational history, and global notifications are untouched.
 */
export async function clearMyNotificationsAction() {
  await requireActiveProfile();

  const supabase = await createClient();

  const { data, error } = await supabase.auth.updateUser({
    data: {
      ddevoluciones_notifications_cleared_at: new Date().toISOString(),
    },
  });

  if (error || !data.user) {
    throw new Error("No se pudo limpiar el buzon. Intenta nuevamente.");
  }

  revalidatePath("/", "layout");
}