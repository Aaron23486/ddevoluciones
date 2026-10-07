export type PresentableNotification = {
  event_type: string;
  title: string;
  message: string;
  created_at: string;
};

const EVENT_LABELS: Record<string, string> = {
  devolucion_creada: "Nueva devolucion",
  recepcion_confirmada: "Devolucion recibida",
  inventario_procesado: "Inventario procesado",
  pallet_registrado: "Pallet registrado",
  pendiente_ubicar: "Material pendiente de ubicacion",
  pendiente_disposicion: "Material pendiente de disposicion",
  devolucion_cerrada: "Devolucion cerrada",
  reporte_carga_recibido: "Retorno de carga registrado",
  reporte_carga_pendiente_envio: "Carga pendiente de envio",
  reporte_carga_enviado: "Carga enviada",
  reporte_carga_anulado: "Reporte de carga anulado",
};

export function humanNotificationTitle(
  notification: Pick<PresentableNotification, "event_type" | "title">,
): string {
  return EVENT_LABELS[notification.event_type] ??
    notification.title?.trim() ??
    "Notificacion operacional";
}

export function humanNotificationMessage(
  notification: Pick<PresentableNotification, "message">,
): string {
  const value = notification.message?.trim();
  return value || "Se registro una actualizacion operacional.";
}

export function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CR", {
    timeZone: "America/Costa_Rica",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}