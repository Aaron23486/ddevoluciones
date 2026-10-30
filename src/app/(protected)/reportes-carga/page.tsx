import { ListPagination } from "@/components/app/list-pagination";
import { CreateReporteCargaForm } from "@/components/reportes-carga/load-forms";
import { ReporteCargaCard } from "@/components/reportes-carga/reporte-carga-card";
import { ReporteCargaDetail } from "@/components/reportes-carga/reporte-carga-detail";
import { ReporteCargaFilters } from "@/components/reportes-carga/reporte-carga-filters";
import { ModalShell } from "@/components/ui/modal-shell";
import { ROUTE_ROLES } from "@/constants/permissions";
import { requireRole } from "@/lib/auth/require-user";
import { buildListHref, one, validUuid } from "@/lib/list-page";
import {
  getReportesCargaDetails,
  getReportesCargaMetrics,
  REPORTE_CARGA_PAGE_SIZE,
  searchReportesCarga,
} from "@/repositories/reportes-carga";

const preserve = (
  params: Record<string, string>,
  page: number,
  extra?: Record<string, string>,
) => buildListHref("/reportes-carga", params, page, extra);

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportesCargaPage({ searchParams }: Props) {
  const profile = await requireRole(ROUTE_ROLES["/reportes-carga"]);

  const params = await searchParams;
  const page = Math.max(Number(one(params.page)) || 1, 1);

  const filters = {
    search: one(params.search),
    estado: one(params.estado),
    desde: one(params.desde),
    hasta: one(params.hasta),
  };

  const [result, metrics] = await Promise.all([
    searchReportesCarga({ ...filters, page }),
    getReportesCargaMetrics(filters),
  ]);

  const detailId = one(params.detail);
  const selected = validUuid(detailId)
    ? (result.rows.find((row) => row.id === detailId) ?? null)
    : null;

  const detail = selected
    ? await getReportesCargaDetails([selected.id])
    : { history: [], evidence: [] };

  const totalPages = Math.max(
    1,
    Math.ceil(metrics.total / REPORTE_CARGA_PAGE_SIZE),
  );

  return (
    <main className="v3-page">
      <section className="v3-page-header dv-glass">
        <div>
          <span className="v3-eyebrow">Operacion logistica</span>
          <h1>Reporte de carga</h1>
          <p>Seguimiento de cargas no entregadas, retorno y reenvios.</p>
        </div>

        <ModalShell
          triggerLabel="+ Nuevo reporte"
          title="Registrar retorno de carga"
          description="El alta queda pendiente de envio y conserva historial de recepcion."
          contextLabel="Reporte de carga"
          contextTone="carga"
          tone="primary"
        >
          <CreateReporteCargaForm />
        </ModalShell>
      </section>

      {one(params.error) ? (
        <div className="dx-message error">Error: {one(params.error)}</div>
      ) : null}

      <section
        className="v4-state-strip v4-state-strip-carga"
        aria-label="Resumen por estado de reporte de carga"
      >
        <article className="v4-state-card v4-state-blue">
          <span>Recibido en muelle</span>
          <strong>{metrics.recibido_muelle}</strong>
        </article>

        <article className="v4-state-card v4-state-orange">
          <span>Pendiente de envio</span>
          <strong>{metrics.pendiente_redespacho}</strong>
        </article>

        <article className="v4-state-card v4-state-green">
          <span>Enviado</span>
          <strong>{metrics.redespachado}</strong>
        </article>

        <article className="v4-state-card v4-state-violet">
          <span>Tasa de envio</span>
          <strong>{metrics.tasa_reenvio}%</strong>
        </article>
      </section>

      <section className="v3-browser-layout">
        <ReporteCargaFilters
          filters={filters}
          pageSize={REPORTE_CARGA_PAGE_SIZE}
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
              No hay reportes para los filtros seleccionados.
            </div>
          ) : (
            <div className="v3-card-grid">
              {result.rows.map((row) => (
                <ReporteCargaCard
                  key={row.id}
                  row={row}
                  role={profile.role}
                  detailHref={preserve(filters, page, { detail: row.id })}
                />
              ))}
            </div>
          )}

          <ListPagination
            page={result.page}
            totalPages={totalPages}
            label="Paginacion de reportes de carga"
            hrefFor={(target) => preserve(filters, target)}
          />
        </section>
      </section>

      {selected ? (
        <ReporteCargaDetail
          selected={selected}
          detail={detail}
          closeHref={preserve(filters, page)}
        />
      ) : null}
    </main>
  );
}
