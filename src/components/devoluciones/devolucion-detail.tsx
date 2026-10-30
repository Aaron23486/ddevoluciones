import Link from "next/link";

import { STATE_LABELS } from "@/lib/devoluciones/case-actions";
import { formatDate } from "@/lib/list-page";
import type { getDevolucionDetail } from "@/repositories/devoluciones";

type Detail = NonNullable<Awaited<ReturnType<typeof getDevolucionDetail>>>;

type Props = {
  detail: Detail & { parent: NonNullable<Detail["parent"]> };
  closeHref: string;
};

// Detalle de un caso: datos generales, materiales, evidencias y trazabilidad.
export function DevolucionDetail({ detail, closeHref }: Props) {
  const { parent } = detail;

  return (
    <div className="dx-route-modal">
      <section className="dx-route-modal-card dv-glass">
        <header className="dx-modal-header">
          <div>
            <span>Detalle de devolucion</span>
            <h2>
              {parent.factura} | {parent.articulo}
            </h2>
            <p>Estado: {STATE_LABELS[parent.estado] ?? parent.estado}</p>
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
                <span>Cantidad</span>
                <strong>{parent.cantidad}</strong>
              </div>
              <div>
                <span>Material inicial</span>
                <strong>{parent.estado_material}</strong>
              </div>
              <div>
                <span>Flujo</span>
                <strong>{parent.flujo_inicial}</strong>
              </div>
              <div>
                <span>Transportista</span>
                <strong>{parent.transportista_nombre || "-"}</strong>
              </div>
              <div>
                <span>Cedula</span>
                <strong>{parent.transportista_cedula || "-"}</strong>
              </div>
              <div>
                <span>Placa</span>
                <strong>{parent.placa_camion || "-"}</strong>
              </div>
            </div>
          </section>

          <section className="v3-detail-section">
            <div className="v3-detail-title">
              <span>02</span>
              <h3>Materiales</h3>
            </div>
            <div className="dx-detail-list">
              {detail.materials.map((material) => (
                <article key={material.id}>
                  <div>
                    <strong>{material.tipo_material}</strong>
                    <span>{material.cantidad} unidades</span>
                  </div>
                  <div>
                    <span>{material.estado}</span>
                    <small>
                      {material.ubicacion ||
                        material.decision_final ||
                        material.pallet_codigo ||
                        "-"}
                    </small>
                  </div>
                </article>
              ))}
            </div>
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
                      <span>{item.etapa}</span>
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
