import {
  filterPersonallyClearedNotifications,
  NOTIFICATION_CLEARED_AT_KEY,
} from "@/lib/notifications/personal-clear";
import { createClient } from "@/lib/supabase/server";

export type InternalNotificationRow = {
  id: string;
  title: string;
  message: string;
  event_type: string;
  target_role: string | null;
  target_user_id: string | null;
  devolucion_id: string | null;
  reporte_carga_id: string | null;
  created_at: string;
  is_read: boolean;
};

export async function getMyNotifications(limit = 12) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_notifications_ep4", {
    p_limit: limit,
  });

  if (error) throw new Error(error.message);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("No se pudo consultar el buzon del usuario autenticado.");
  }

  const notices = (data ?? []) as InternalNotificationRow[];

  return filterPersonallyClearedNotifications(
    notices,
    user.user_metadata?.[NOTIFICATION_CLEARED_AT_KEY],
  );
}
