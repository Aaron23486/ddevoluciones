import Link from "next/link";

import { formatDate } from "@/lib/list-page";
import { LOAD_STATE_LABELS } from "@/lib/reportes-carga/labels";
import type {
  getReportesCargaDetails,
  searchReportesCarga,
} from "@/repositories/reportes-carga";

type Row = Awaited<ReturnType<typeof searchReportesCarga>>["rows"][number];
type Details = Awaited<ReturnType<typeof getReportesCargaDetails>>;

// Detalle de un reporte: datos generales, motivo, evidencias y trazabilidad.
export function ReporteCargaDetail({
  selected,
  detail,
  closeHref,
}: {
  selected: Row;
  detail: Pick<Details, "evidence" | "history">;
  closeHref: string;
}) {
  return (
    <div className="dx-route-modal">
      <section className="dx-route-modal-card dv-glass">
        <header className="dx-modal-header">
          <div>
            <span>Detalle de carga</span>
            <h2>{selected.cliente}</h2>
            <p>{LOAD_STATE_LABELS[selected.estado] ?? selected.estado}</p>
          </div>
          <Link href={closeHref} className="dx-modal-close">
            x
          </Link>
        </header>

        <div className="v3-detail-layout">
          <section className="v3-detail-section">
            <div className="v3-detail-title">
              <span>01</span>
              <h3>Informacion general</h3>
            </div>

            <div className="dx-detail-grid">
              <div>
                <span>Documento</span>
                <strong>{selected.numero_documento || "-"}</strong>
              </div>
              <div>
                <span>Factura</span>
                <strong>{selected.factura || "-"}</strong>
              </div>
              <div>
                <span>Cliente</span>
                <strong>{selected.cliente}</strong>
              </div>
              <div>
                <span>Articulo</span>
                <strong>{selected.articulo || "-"}</strong>
              </div>
              <div>
                <span>Cantidad</span>
                <strong>{selected.cantidad}</strong>
              </div>
              <div>
                <span>Estado fisico</span>
                <strong>{selected.estado_fisico_carga || "-"}</strong>
              </div>
              <div>
                <span>Ruta</span>
                <strong>{selected.ruta || "-"}</strong>
              </div>
              <div>
                <span>Transportista</span>
                <strong>{selected.transportista || "-"}</strong>
              </div>
              <div>
                <span>Placa</span>
                <strong>{selected.placa || "-"}</strong>
              </div>
            </div>
          </section>

          <section className="v3-detail-section">
            <div className="v3-detail-title">
              <span>02</span>
              <h3>Motivo del retorno</h3>
            </div>
            <p className="v3-detail-copy">
              {selected.motivo_no_entrega || "Sin motivo registrado."}
            </p>
          </section>

          <section className="v3-detail-section">
            <div className="v3-detail-title">
              <span>03</span>
              <h3>Evidencias</h3>
            </div>
            <div className="dx-detail-list">
              {detail.evidence.length > 0 ? (
                detail.evidence.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.tipo}</strong>
                      <span>{item.descripcion || "Sin descripcion"}</span>
                    </div>
                    <small>{formatDate(item.created_at)}</small>
                  </article>
                ))
              ) : (
                <div className="v3-detail-empty">
                  Sin evidencias registradas.
                </div>
              )}
            </div>
          </section>

          <section className="v3-detail-section">
            <div className="v3-detail-title">
              <span>04</span>
              <h3>Trazabilidad</h3>
            </div>
            <div className="dx-timeline">
              {detail.history.map((item) => (
                <article key={item.id}>
                  <i />
                  <div>
                    <strong>{item.accion}</strong>
                    <p>
                      {item.estado_anterior || "Inicio"} {" -> "}
                      {item.estado_nuevo || "Sin cambio"}
                    </p>
                    <small>{formatDate(item.created_at)}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
