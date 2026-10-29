"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ModalShell({
  triggerLabel,
  title,
  description,
  children,
  tone = "default",
  contextLabel = "Operacion",
  contextTone = "default",
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "default" | "primary" | "danger";
  contextLabel?: string;
  contextTone?: "default" | "devoluciones" | "carga";
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
              className={`dx-modal-card context-${contextTone}`}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
            >
              <header className="dx-modal-header">
                <div className="dx-modal-heading-copy">
                  <span className={`dx-modal-context tone-${contextTone}`}>
                    {contextLabel}
                  </span>
                  <h2>{title}</h2>
                  {description ? <p>{description}</p> : null}
                </div>

                <button
                  type="button"
                  className="dx-modal-close"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar modal"
                >
                  x
                </button>
              </header>

              <div className="dx-modal-body">{children}</div>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={`dx-modal-trigger tone-${tone}`}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {modal}
    </>
  );
}
