"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  details,
  children,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  details?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const modal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="dx-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <section
              ref={dialogRef}
              className="dx-confirm-card"
              role="alertdialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
            >
              <div className="dx-confirm-icon" aria-hidden="true">
                !
              </div>

              <div className="dx-confirm-copy">
                <span>Accion destructiva</span>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>

              {details ? (
                <div className="dx-confirm-details">{details}</div>
              ) : null}

              <div className="dx-confirm-actions">
                <button
                  type="button"
                  className="dx-confirm-cancel"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </button>

                {children}
              </div>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="v3-card-danger dx-confirm-trigger"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {modal}
    </>
  );
}
