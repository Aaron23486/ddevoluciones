import { DevolucionCard } from "@/components/devoluciones/devolucion-card";
import { DevolucionDetail } from "@/components/devoluciones/devolucion-detail";
import { DevolucionFilters } from "@/components/devoluciones/devolucion-filters";
import { CreateDevolucionForm } from "@/components/devoluciones/stage-forms";
import { ListPagination } from "@/components/app/list-pagination";
import { ModalShell } from "@/components/ui/modal-shell";
import { ROUTE_ROLES } from "@/constants/permissions";
import { requireRole } from "@/lib/auth/require-user";
import { buildListHref, one, validUuid } from "@/lib/list-page";
import {
  getDevolucionDetail,
  getDevolucionFilteredCount,
  getDevolucionStateMetrics,
  getMaterialsForDevoluciones,
  PAGE_SIZE,
  searchDevoluciones,
  type DevolucionMaterialRow,
} from "@/repositories/devoluciones";

const buildQuery = (
  filters: Record<string, string>,
  page: number,
  extra?: Record<string, string>,
) => buildListHref("/devoluciones", filters, page, extra);

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function groupMaterials(rows: DevolucionMaterialRow[]) {
  const map = new Map<string, DevolucionMaterialRow[]>();

  for (const row of rows) {
    map.set(row.devolucion_id, [...(map.get(row.devolucion_id) ?? []), row]);
  }

  return map;
}

export default async function DevolucionesPage({ searchParams }: Props) {
  const profile = await requireRole(ROUTE_ROLES["/devoluciones"]);

  const params = await searchParams;
  const page = Math.max(Number(one(params.page)) || 1, 1);

  const filters = {
    search: one(params.search),
    estado: one(params.estado),
    material: one(params.material),
    flujo: one(params.flujo),
    desde: one(params.desde),
    hasta: one(params.hasta),
  };

  const [result, stateMetrics, totalCount] = await Promise.all([
    searchDevoluciones({ ...filters, page }),
    getDevolucionStateMetrics(),
    getDevolucionFilteredCount(filters),
  ]);

  const materials = await getMaterialsForDevoluciones(
    result.rows.map((row) => row.id),
  );
  const materialsByReturn = groupMaterials(materials);

  const detailId = one(params.detail);
  const detail =
    detailId && validUuid(detailId)
      ? await getDevolucionDetail(detailId)
      : null;

  const canCreate = profile.role === "admin" || profile.role === "devoluciones";
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="v3-page">
      <section className="v3-page-header dv-glass">
        <div>
          <span className="v3-eyebrow">Sistema de trazabilidad</span>
          <h1>Devoluciones</h1>
          <p>Gestion y trazabilidad completa de devoluciones.</p>
        </div>

        {canCreate ? (
          <ModalShell
            triggerLabel="+ Nueva devolucion"
            title="Registrar devolucion"
            description="Alta inicial con evidencias privadas."
            contextLabel="Devoluciones"
            contextTone="devoluciones"
            tone="primary"
          >
            <CreateDevolucionForm />
          </ModalShell>
        ) : null}
      </section>

      <section
        className="v4-state-strip v4-state-strip-devoluciones"
        aria-label="Resumen por estado de devoluciones"
      >
        <article className="v4-state-card v4-state-blue">
          <span>Pendiente de entrega</span>
          <strong>{stateMetrics.pendiente_entrega}</strong>
        </article>

        <article className="v4-state-card v4-state-violet">
          <span>Pendiente de proceso</span>
          <strong>{stateMetrics.pendiente_proceso}</strong>
        </article>

        <article className="v4-state-card v4-state-cyan">
          <span>Recibida en bodega</span>
          <strong>{stateMetrics.recibida_bodega}</strong>
        </article>

        <article className="v4-state-card v4-state-orange">
          <span>Pendiente de ubicar</span>
          <strong>{stateMetrics.pendiente_ubicar}</strong>
        </article>

        <article className="v4-state-card v4-state-red">
          <span>Pendiente de disposicion</span>
          <strong>{stateMetrics.pendiente_disposicion}</strong>
        </article>

        <article className="v4-state-card v4-state-green">
          <span>Cerrada</span>
          <strong>{stateMetrics.cerrada}</strong>
        </article>
      </section>

      {one(params.error) ? (
        <div className="dx-message error">Error: {one(params.error)}</div>
      ) : null}

      <section className="v3-browser-layout">
        <DevolucionFilters
          filters={filters}
          pageSize={PAGE_SIZE}
          page={result.page}
        />

        <section className="v3-results-panel dv-glass">
          <div className="v3-results-heading">
            <div>
              <span className="v3-eyebrow">Resultados</span>
              <h2>Casos registrados</h2>
            </div>

            <div>
              <span>{result.rows.length} visibles</span>
              <span>Max. 4 por fila</span>
            </div>
          </div>

          {result.rows.length === 0 ? (
            <div className="v3-empty">
              No hay devoluciones para los filtros seleccionados.
            </div>
          ) : (
            <div className="v3-card-grid">
              {result.rows.map((row) => (
                <DevolucionCard
                  key={row.id}
                  row={row}
                  materials={materialsByReturn.get(row.id) ?? []}
                  role={profile.role}
                  detailHref={buildQuery(filters, page, { detail: row.id })}
                />
              ))}
            </div>
          )}

          <ListPagination
            page={result.page}
            totalPages={totalPages}
            label="Paginacion de devoluciones"
            hrefFor={(target) => buildQuery(filters, target)}
          />
        </section>
      </section>

      {detail?.parent ? (
        <DevolucionDetail
          detail={{ ...detail, parent: detail.parent }}
          closeHref={buildQuery(filters, page)}
        />
      ) : null}
    </main>
  );
}
