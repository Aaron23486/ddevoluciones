import Link from "next/link";

import { RedispatchForm } from "@/components/reportes-carga/load-forms";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalShell } from "@/components/ui/modal-shell";
import type { UserRole } from "@/constants/roles";
import { annulReporteCargaAction } from "@/features/reportes-carga/actions";
import { formatDate } from "@/lib/list-page";
import { LOAD_STATE_LABELS } from "@/lib/reportes-carga/labels";
import type { searchReportesCarga } from "@/repositories/reportes-carga";

type Row = Awaited<ReturnType<typeof searchReportesCarga>>["rows"][number];

// Solo inventario y admin registran el envío; la RPC vuelve a comprobarlo.
function canRedispatch(role: UserRole): boolean {
  return role === "admin" || role === "inventario";
}

// Tarjeta de un reporte de carga con sus acciones.
export function ReporteCargaCard({
  row,
  role,
  detailHref,
}: {
  row: Row;
  role: UserRole;
  detailHref: string;
}) {
  return (
    <article className="v3-case-card load">
      <header className="v3-card-head">
        <div>
          <span>
            {row.numero_documento
              ? `Documento ${row.numero_documento}`
              : `Factura ${row.factura ?? "-"}`}
          </span>
          <h3>{row.cliente}</h3>
        </div>

        <span className={`v3-state state-${row.estado}`}>
          {LOAD_STATE_LABELS[row.estado] ?? row.estado}
        </span>
      </header>

      <div className="v3-card-core">
        <div>
          <span>Articulo</span>
          <strong>{row.articulo || "-"}</strong>
        </div>
        <div>
          <span>Cantidad</span>
          <strong>{row.cantidad}</strong>
        </div>
        <div>
          <span>Ruta</span>
          <strong>{row.ruta || "-"}</strong>
        </div>
      </div>

      <div className="v3-card-logistics">
        <div>
          <span>Transportista</span>
          <strong>{row.transportista || "-"}</strong>
        </div>
        <div>
          <span>Placa</span>
          <strong>{row.placa || "-"}</strong>
        </div>
      </div>

      <p className="v3-card-reason">
        {row.motivo_no_entrega || "Sin motivo registrado."}
      </p>

      <div className="v3-card-date">
        {formatDate(row.recibido_at ?? row.created_at)}
      </div>

      <footer className="v3-card-actions">
        <Link href={detailHref} className="v3-card-primary-action">
          Ver detalle
        </Link>

        <div className="v3-card-secondary-actions">
          {row.estado === "pendiente_redespacho" && canRedispatch(role) ? (
            <ModalShell
              triggerLabel="Registrar envio"
              title={`Envio - ${row.cliente}`}
              description="Registra conductor, placa, observaciones y evidencia."
              tone="primary"
            >
              <RedispatchForm reporteCargaId={row.id} />
            </ModalShell>
          ) : null}

          {role === "admin" ? (
            <ConfirmDialog
              triggerLabel="Anular"
              title="Anular reporte de carga"
              description="Esta accion no se puede deshacer. Confirma que deseas anular este reporte."
              details={
                <div className="dx-confirm-facts">
                  <div>
                    <span>Documento</span>
                    <strong>
                      {row.numero_documento || row.factura || "-"}
                    </strong>
                  </div>
                  <div>
                    <span>Cliente</span>
                    <strong>{row.cliente}</strong>
                  </div>
                </div>
              }
            >
              <form action={annulReporteCargaAction}>
                <input type="hidden" name="reporteCargaId" value={row.id} />
                <button className="dx-confirm-delete" type="submit">
                  Anular reporte
                </button>
              </form>
            </ConfirmDialog>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
