/**
 * UI-only preference for the current authenticated account.
 * Shared operational notification records remain intact.
 */
export const NOTIFICATION_CLEARED_AT_KEY =
  "ddevoluciones_notifications_cleared_at";

export function filterPersonallyClearedNotifications<
  T extends { created_at: string },
>(notifications: T[], lastClearedAt: unknown): T[] {
  if (typeof lastClearedAt !== "string") {
    return notifications;
  }

  const cutoff = Date.parse(lastClearedAt);

  if (!Number.isFinite(cutoff)) {
    return notifications;
  }

  return notifications.filter((notification) => {
    const timestamp = Date.parse(notification.created_at);
    return Number.isFinite(timestamp) && timestamp > cutoff;
  });
}