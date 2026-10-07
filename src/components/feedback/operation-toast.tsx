"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const SUCCESS: Record<string, { title: string; message: string }> = {
  created: {
    title: "Registro completado",
    message: "La informacion se guardo correctamente.",
  },
  received: {
    title: "Recepcion confirmada",
    message: "La devolucion fue recibida correctamente.",
  },
  processed: {
    title: "Inventario procesado",
    message: "El procesamiento de inventario se completo.",
  },
  located: {
    title: "Material ubicado",
    message: "La ubicacion del material quedo registrada.",
  },
  disposed: {
    title: "Disposicion registrada",
    message: "La disposicion del material se completo correctamente.",
  },
  deleted: {
    title: "Devolucion eliminada",
    message: "La devolucion fue eliminada correctamente.",
  },
  redispatched: {
    title: "Envio registrado",
    message: "La carga fue enviada nuevamente a ruta.",
  },
  annulled: {
    title: "Reporte anulado",
    message: "El reporte de carga fue anulado correctamente.",
  },
  role_changed: {
    title: "Rol actualizado",
    message: "El rol del usuario se actualizo correctamente.",
  },
  activated: {
    title: "Usuario activado",
    message: "El usuario quedo activo.",
  },
  deactivated: {
    title: "Usuario desactivado",
    message: "El usuario quedo inactivo.",
  },
};

const ERROR: Record<string, { title: string; message: string }> = {
  validation: {
    title: "Revisa la informacion",
    message: "Hay datos incompletos o invalidos.",
  },
  create_failed: {
    title: "No se pudo registrar",
    message: "La operacion no se completo. Intenta nuevamente.",
  },
  evidence_validation: {
    title: "Revisa las evidencias",
    message: "Una de las evidencias no cumple los requisitos.",
  },
};

export function OperationToast() {
  const params = useSearchParams();
  const success = params.get("success");
  const error = params.get("error");

  if (!success && !error) return null;

  // The event is mounted only while the redirect query exists.
  // A new result gets a fresh timer/state without synchronizing state in an effect.
  return (
    <OperationToastMessage
      key={`${success ?? ""}:${error ?? ""}`}
      success={success}
      error={error}
    />
  );
}

function OperationToastMessage({
  success,
  error,
}: {
  success: string | null;
  error: string | null;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  const content = useMemo(() => {
    if (success) {
      if (success === "created") {
        return pathname.startsWith("/devoluciones")
          ? {
              title: "Devoluci\u00f3n registrada",
              message: "La devoluci\u00f3n se registr\u00f3 correctamente.",
            }
          : pathname.startsWith("/reportes-carga")
            ? {
                title: "Retorno de carga registrado",
                message: "El retorno se registr\u00f3 correctamente.",
              }
            : SUCCESS[success];
      }
      return (
        SUCCESS[success] ?? {
          title: "Operacion completada",
          message: "La accion se completo correctamente.",
        }
      );
    }

    if (error) {
      return (
        ERROR[error] ?? {
          title: "No se pudo completar",
          message: "La operacion no se completo. Revisa los datos e intenta nuevamente.",
        }
      );
    }

    return null;
  }, [error, success, pathname]);

  useEffect(() => {
    if (!success) return;
    window.dispatchEvent(new Event("ddevoluciones-notifications-refresh"));
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("ddevoluciones-notifications");
      channel.postMessage("refresh");
      channel.close();
    }
  }, [success]);

  useEffect(() => {
    // Timer callbacks may update UI state; no synchronous setState in the effect.
    const timer = window.setTimeout(() => setVisible(false), 3200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (visible || (!success && !error)) return;

    const next = new URLSearchParams(params.toString());
    next.delete("success");
    next.delete("error");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [error, params, pathname, router, success, visible]);

  if (!content || !visible) return null;

  const isError = Boolean(error);

  return (
    <>
      <div className="dv-operation-toast-backdrop" aria-hidden="true" />
      <div
        className={`dv-operation-toast${isError ? " error" : " success"}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <span className="dv-operation-toast-icon" aria-hidden="true">
        {isError ? <XCircle size={22} /> : <CheckCircle2 size={22} />}
      </span>
      <div>
        <strong>{content.title}</strong>
        <p>{content.message}</p>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar mensaje"
      >
        <X size={16} />
      </button>
      </div>
    </>
  );
}