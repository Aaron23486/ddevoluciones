import Link from "next/link";
import { EvidencePicker } from "@/components/ui/evidence-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  annulReporteCargaAction,
  createReporteCargaAction,
  redispatchReporteCargaAction,
} from "@/features/reportes-carga/actions";
import { requireRole } from "@/lib/auth/require-user";
import {
  getReportesCargaDetails,
  getReportesCargaMetrics,
  REPORTE_CARGA_PAGE_SIZE,
  searchReportesCarga,
} from "@/repositories/reportes-carga";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function validUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function preserve(
  params: Record<string, string>,
  page: number,
  extra?: Record<string, string>,
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  if (page > 1) query.set("page", String(page));

  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) query.set(key, value);
  }

  const text = query.toString();
  return text ? `?${text}` : "/reportes-carga";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

const LOAD_STATE_LABELS: Record<string, string> = {
  recibido_muelle: "Recibido en muelle",
  pendiente_redespacho: "Pendiente de envio",
  redespachado: "Enviado",
};

function paginationItems(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = Array.from(
    new Set(
      [1, currentPage - 1, currentPage, currentPage + 1, totalPages].filter(
        (value) => value >= 1 && value <= totalPages,
      ),
    ),
  ).sort((a, b) => a - b);

  const result: Array<number | "ellipsis"> = [];

  pages.forEach((value, index) => {
    const previous = pages[index - 1];

    if (index > 0 && previous !== undefined && value - previous > 1) {
      result.push("ellipsis");
    }

    result.push(value);
  });

  return result;
}

export default async function ReportesCargaPage({ searchParams }: Props) {
  const profile = await requireRole([
    "admin",
    "inventario",
    "transportes",
    "seguridad",
  ]);

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
    ? result.rows.find((row) => row.id === detailId) ?? null
    : null;

  const detail = selected
    ? await getReportesCargaDetails([selected.id])
    : { history: [], evidence: [] };

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const closeDetailHref = preserve(filters, page);
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
          <form action={createReporteCargaAction} className="dx-form-grid">
            <input name="numeroDocumento" placeholder="Numero documento" />
            <input name="factura" placeholder="Factura" />
            <input name="cliente" required placeholder="Cliente *" />
            <input name="articulo" required placeholder="Articulo *" />
            <input
              name="cantidad"
              required
              type="number"
              min="1"
              step="1"
              placeholder="Cantidad *"
            />

            <select name="estadoFisicoCarga" required defaultValue="">
              <option value="" disabled>
                Estado fisico *
              </option>
              <option value="Buen estado">Buen estado</option>
              <option value="Mal estado">Mal estado</option>
            </select>

            <input name="transportista" placeholder="Transportista" />
            <input name="ruta" placeholder="Ruta" />
            <input name="placa" placeholder="Placa" />

            <textarea
              name="descripcionMaterial"
              placeholder="Descripcion material"
              className="dx-col-span-all"
            />
            <textarea
              name="motivoNoEntrega"
              required
              placeholder="Motivo de no entrega *"
            />
            <textarea
              name="observacionesRetorno"
              placeholder="Observaciones retorno"
            />

            <EvidencePicker
              name="evidenciaRecepcion"
              label="Evidencia de recepcion"
              required
            />

            <button className="dx-submit dx-col-span-all">
              Registrar retorno
            </button>
          </form>
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
        <aside className="v3-filter-column">
          <div className="v3-filter-sticky dv-glass">
            <div className="v3-filter-heading">
              <div>
                <span className="v3-eyebrow">Consulta</span>
                <h2>Filtros</h2>
              </div>
              <span>{activeFilters} activos</span>
            </div>

            <form method="get" className="v3-filter-form">
              <label>
                <span>Buscar</span>
                <input
                  name="search"
                  defaultValue={filters.search}
                  placeholder="Cliente, articulo, ruta o factura"
                />
              </label>

              <label>
                <span>Estado</span>
                <select name="estado" defaultValue={filters.estado}>
                  <option value="">Todos</option>
                  <option value="pendiente_redespacho">
                    Pendiente de envio
                  </option>
                  <option value="redespachado">Enviado</option>
                </select>
              </label>

              <label>
                <span>Desde</span>
                <input name="desde" type="date" defaultValue={filters.desde} />
              </label>

              <label>
                <span>Hasta</span>
                <input name="hasta" type="date" defaultValue={filters.hasta} />
              </label>

              <button className="v3-filter-apply">Aplicar filtros</button>
              <Link href="/reportes-carga" className="v3-filter-clear">
                Limpiar filtros
              </Link>
            </form>

            <div className="v3-filter-foot">
              <span>{REPORTE_CARGA_PAGE_SIZE} registros max.</span>
              <span>Pagina {result.page}</span>
            </div>
          </div>
        </aside>

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
              {result.rows.map((row) => {
                const detailHref = preserve(filters, page, {
                  detail: row.id,
                });

                return (
                  <article key={row.id} className="v3-case-card load">
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
                        {row.estado === "pendiente_redespacho" &&
                        (profile.role === "admin" ||
                          profile.role === "inventario") ? (
                          <ModalShell
                            triggerLabel="Registrar envio"
                            title={`Envio - ${row.cliente}`}
                            description="Registra conductor, placa, observaciones y evidencia."
                            tone="primary"
                          >
                            <form
                              action={redispatchReporteCargaAction}
                              className="dx-form-grid"
                            >
                              <input
                                type="hidden"
                                name="reporteCargaId"
                                value={row.id}
                              />
                              <input
                                required
                                name="conductor"
                                placeholder="Conductor *"
                              />
                              <input
                                required
                                name="placaSalida"
                                placeholder="Placa salida *"
                              />
                              <textarea
                                required
                                name="observaciones"
                                placeholder="Observaciones *"
                              />

                              <EvidencePicker
                                name="evidenciaRedespacho"
                                label="Evidencia de salida"
                                required
                              />

                              <button className="dx-submit dx-col-span-all">
                                Registrar envio
                              </button>
                            </form>
                          </ModalShell>
                        ) : null}

                        {profile.role === "admin" ? (
                          <ConfirmDialog
                            triggerLabel="Anular"
                            title="Anular reporte de carga"
                            description="Esta accion no se puede deshacer. Confirma que deseas anular este reporte."
                            details={
                              <div className="dx-confirm-facts">
                                <div>
                                  <span>Documento</span>
                                  <strong>
                                    {row.numero_documento ||
                                      row.factura ||
                                      "-"}
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
                              <input
                                type="hidden"
                                name="reporteCargaId"
                                value={row.id}
                              />
                              <button
                                className="dx-confirm-delete"
                                type="submit"
                              >
                                Anular reporte
                              </button>
                            </form>
                          </ConfirmDialog>
                        ) : null}
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}

          <nav className="v3-pagination v5-pagination" aria-label="Paginacion de reportes de carga">
            {result.page > 1 ? (
              <Link href={preserve(filters, result.page - 1)}>
                Anterior
              </Link>
            ) : (
              <span className="disabled">Anterior</span>
            )}

            <div className="v5-page-list">
              {paginationItems(result.page, totalPages).map((item, index) =>
                item === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="v5-page-ellipsis"
                    aria-hidden="true"
                  >
                    ...
                  </span>
                ) : (
                  <Link
                    key={item}
                    href={preserve(filters, item)}
                    className={item === result.page ? "active" : ""}
                    aria-current={item === result.page ? "page" : undefined}
                  >
                    {item}
                  </Link>
                ),
              )}
            </div>

            <strong>
              Pagina {result.page} de {totalPages}
            </strong>

            {result.page < totalPages ? (
              <Link href={preserve(filters, result.page + 1)}>
                Siguiente
              </Link>
            ) : (
              <span className="disabled">Siguiente</span>
            )}
          </nav>
        </section>
      </section>

      {selected ? (
        <div className="dx-route-modal">
          <section className="dx-route-modal-card dv-glass">
            <header className="dx-modal-header">
              <div>
                <span>Detalle de carga</span>
                <h2>{selected.cliente}</h2>
                <p>{LOAD_STATE_LABELS[selected.estado] ?? selected.estado}</p>
              </div>
              <Link href={closeDetailHref} className="dx-modal-close">
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
      ) : null}
    </main>
  );
}