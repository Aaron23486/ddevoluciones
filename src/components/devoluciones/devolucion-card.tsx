import Link from "next/link";

import {
  DispositionForm,
  InventoryForm,
  LocationForm,
  ReceptionForm,
} from "@/components/devoluciones/stage-forms";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalShell } from "@/components/ui/modal-shell";
import type { UserRole } from "@/constants/roles";
import { deleteDevolucionAction } from "@/features/devoluciones/actions";
import { caseActions, STATE_LABELS } from "@/lib/devoluciones/case-actions";
import { formatDate } from "@/lib/list-page";
import type {
  DevolucionMaterialRow,
  DevolucionSearchRow,
} from "@/repositories/devoluciones";

type Props = {
  row: DevolucionSearchRow;
  materials: readonly DevolucionMaterialRow[];
  role: UserRole;
  detailHref: string;
};

// Tarjeta de un caso con sus datos principales y las acciones de la etapa en curso.
export function DevolucionCard({ row, materials, role, detailHref }: Props) {
  const can = caseActions(role, row);
  const goodPending = materials.filter(
    (material) =>
      material.tipo_material === "bueno" &&
      material.estado === "pendiente_ubicar",
  );
  const badPending = materials.filter(
    (material) =>
      material.tipo_material === "malo" &&
      material.estado === "pendiente_disposicion",
  );

  return (
    <article className="v3-case-card">
      <header className="v3-card-head">
        <div>
          <span>Factura {row.factura}</span>
          <h3>{row.articulo}</h3>
        </div>

        <span className={`v3-state state-${row.estado}`}>
          {STATE_LABELS[row.estado] ?? row.estado}
        </span>
      </header>

      <div className="v3-card-core">
        <div>
          <span>Cantidad</span>
          <strong>{row.cantidad}</strong>
        </div>
        <div>
          <span>Material</span>
          <strong>{row.estado_material}</strong>
        </div>
        <div>
          <span>Flujo</span>
          <strong>{row.flujo_inicial}</strong>
        </div>
      </div>

      <div className="v3-card-logistics">
        <div>
          <span>Transportista</span>
          <strong>{row.transportista_nombre || "-"}</strong>
        </div>
        <div>
          <span>Placa</span>
          <strong>{row.placa_camion || "-"}</strong>
        </div>
      </div>

      <div className="v3-card-date">{formatDate(row.created_at)}</div>

      <footer className="v3-card-actions">
        <Link href={detailHref} className="v3-card-primary-action">
          Ver detalle
        </Link>

        <div className="v3-card-secondary-actions">
          {can.receive ? (
            <ModalShell
              triggerLabel="Recepcion"
              title={`Recepcion - ${row.factura}`}
              description="Confirma cantidad, clasificacion y evidencias."
              tone="primary"
            >
              <ReceptionForm devolucionId={row.id} />
            </ModalShell>
          ) : null}

          {can.inventory ? (
            <ModalShell
              triggerLabel="Inventario"
              title={`Inventario - ${row.factura}`}
              description="Registra pallet/control y separacion del material."
              tone="primary"
            >
              <InventoryForm devolucionId={row.id} />
            </ModalShell>
          ) : null}

          {can.locate
            ? goodPending.map((material) => (
                <ModalShell
                  key={material.id}
                  triggerLabel="Ubicar"
                  title={`Ubicacion - ${row.factura}`}
                  description={`${material.cantidad} unidades de material bueno.`}
                  tone="primary"
                >
                  <LocationForm materialId={material.id} />
                </ModalShell>
              ))
            : null}

          {can.dispose
            ? badPending.map((material) => (
                <ModalShell
                  key={material.id}
                  triggerLabel="Disponer"
                  title={`Disposicion - ${row.factura}`}
                  description={`${material.cantidad} unidades de material malo.`}
                  tone="danger"
                >
                  <DispositionForm materialId={material.id} />
                </ModalShell>
              ))
            : null}

          {can.remove ? (
            <ConfirmDialog
              triggerLabel="Eliminar"
              title="Eliminar devolucion"
              description="Esta accion no se puede deshacer. Confirma que deseas eliminar este caso."
              details={
                <div className="dx-confirm-facts">
                  <div>
                    <span>Factura</span>
                    <strong>{row.factura}</strong>
                  </div>
                  <div>
                    <span>Articulo</span>
                    <strong>{row.articulo}</strong>
                  </div>
                </div>
              }
            >
              <form action={deleteDevolucionAction}>
                <input type="hidden" name="devolucionId" value={row.id} />
                <button className="dx-confirm-delete" type="submit">
                  Eliminar definitivamente
                </button>
              </form>
            </ConfirmDialog>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
