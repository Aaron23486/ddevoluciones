"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  clearMyNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/notifications/actions";
import {
  formatNotificationDate,
  humanNotificationMessage,
  humanNotificationTitle,
} from "@/lib/notifications/notification-presenter";
import type { InternalNotificationRow } from "@/repositories/notifications";

type Props = {
  initialNotifications: InternalNotificationRow[];
};

const POLL_MS = 4000;
const CHANNEL_NAME = "ddevoluciones-notifications";

export function NotificationsCenter({ initialNotifications }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [flash, setFlash] = useState(false);
  const [syncIssue, setSyncIssue] = useState(false);
  const knownIds = useRef(new Set(initialNotifications.map((item) => item.id)));
  const running = useRef(false);

  const unread = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  );

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (running.current) return;
    running.current = true;

    try {
      const response = await fetch("/api/notifications", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });

      if (!response.ok) throw new Error("Sincronizacion fallida");

      const payload = (await response.json()) as {
        notifications?: InternalNotificationRow[];
      };
      const next = Array.isArray(payload.notifications)
        ? payload.notifications
        : [];

      const hasNew = next.some((item) => !knownIds.current.has(item.id));
      knownIds.current = new Set(next.map((item) => item.id));
      setNotifications(next);
      setSyncIssue(false);

      if (hasNew) {
        setFlash(true);
        window.setTimeout(() => setFlash(false), 1200);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setSyncIssue(true);
      }
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;

    const schedule = () => {
      window.clearInterval(timer);
      if (document.visibilityState === "visible") {
        timer = window.setInterval(
          () => void refresh(controller.signal),
          POLL_MS,
        );
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh(controller.signal);
      }
      schedule();
    };

    const onFocus = () => void refresh(controller.signal);

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = () => void refresh(controller.signal);
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("ddevoluciones-notifications-refresh", onFocus);
    schedule();

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(
        "ddevoluciones-notifications-refresh",
        onFocus,
      );
      channel?.close();
    };
  }, [refresh]);

  const broadcast = () => {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage("refresh");
      channel.close();
    }
  };

  async function afterMutation(action: () => Promise<void>) {
    await action();
    await refresh();
    broadcast();
  }

  return (
    <details className={`dv-notifications-center${flash ? " has-new" : ""}`}>
      <summary
        className="dv-notification-bell"
        aria-label={
          unread > 0
            ? `Abrir notificaciones. ${unread} sin leer`
            : "Abrir notificaciones"
        }
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="dv-notification-count">{unread}</span>
        ) : null}
      </summary>

      <div className="dv-notifications-panel dv-glass">
        <div className="dv-notifications-header">
          <div>
            <strong>Notificaciones internas</strong>
            <small>
              {unread > 0
                ? `${unread} ${unread === 1 ? "sin leer" : "sin leer"}`
                : "Todo al dia"}
            </small>
          </div>

          <div className="dv-notifications-tools">
            {unread > 0 ? (
              <form
                action={async () => {
                  await afterMutation(markAllNotificationsReadAction);
                }}
              >
                <button className="dv-mini-button" type="submit">
                  Marcar todas
                </button>
              </form>
            ) : null}

            {notifications.length > 0 ? (
              <ConfirmDialog
                triggerLabel="Limpiar buzon"
                title="Limpiar buzon"
                description="Se retiraran de tu buzon las notificaciones actuales. Los nuevos avisos seguiran apareciendo y otros usuarios no se veran afectados."
              >
                <form
                  action={async () => {
                    await afterMutation(clearMyNotificationsAction);
                  }}
                >
                  <button type="submit" className="dx-confirm-delete">
                    Limpiar ahora
                  </button>
                </form>
              </ConfirmDialog>
            ) : null}
          </div>
        </div>

        {syncIssue ? (
          <p className="dv-notifications-sync-error" role="status">
            {
              "No se pudieron actualizar los avisos. Se intentar\u00e1 nuevamente."
            }
          </p>
        ) : null}
        <div className="dv-notifications-list">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`dv-notification-item${
                notification.is_read ? "" : " unread"
              }`}
            >
              <div className="dv-notification-copy">
                <div className="dv-notification-title-line">
                  {!notification.is_read ? (
                    <span className="dv-notification-dot" aria-hidden="true" />
                  ) : null}
                  <strong>{humanNotificationTitle(notification)}</strong>
                </div>
                <p>{humanNotificationMessage(notification)}</p>
                <small>{formatNotificationDate(notification.created_at)}</small>
              </div>

              {!notification.is_read ? (
                <form
                  action={async (formData) => {
                    await afterMutation(() =>
                      markNotificationReadAction(formData),
                    );
                  }}
                >
                  <input
                    type="hidden"
                    name="notificationId"
                    value={notification.id}
                  />
                  <button className="dv-mini-button" type="submit">
                    Marcar leida
                  </button>
                </form>
              ) : null}
            </article>
          ))}

          {notifications.length === 0 ? (
            <div className="dv-notifications-empty">
              <strong>Todo al dia</strong>
              <p>No tienes notificaciones operacionales pendientes.</p>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}
