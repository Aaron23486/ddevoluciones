import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EvidencePicker } from "@/components/ui/evidence-picker";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  confirmReceptionAction,
  createDevolucionAction,
  deleteDevolucionAction,
  disposeMaterialAction,
  locateMaterialAction,
  processInventoryAction,
} from "@/features/devoluciones/actions";
import { requireRole } from "@/lib/auth/require-user";
import {
  getDevolucionDetail,
  getDevolucionFilteredCount,
  getDevolucionStateMetrics,
  getMaterialsForDevoluciones,
  PAGE_SIZE,
  searchDevoluciones,
  type DevolucionMaterialRow,
} from "@/repositories/devoluciones";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function validUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function buildQuery(
  filters: Record<string, string>,
  page: number,
  extra?: Record<string, string>,
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }

  if (page > 1) query.set("page", String(page));

  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) query.set(key, value);
  }

  const text = query.toString();
  return text ? `?${text}` : "/devoluciones";
}

const STATE_LABELS: Record<string, string> = {
  pendiente_entrega: "Pendiente de entrega",
  pendiente_proceso: "Pendiente de proceso",
  recibida_bodega: "Recibida en bodega",
  pendiente_ubicar: "Pendiente de ubicar",
  pendiente_disposicion: "Pendiente de disposicion",
  cerrada: "Cerrada",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function groupMaterials(rows: DevolucionMaterialRow[]) {
  const map = new Map<string, DevolucionMaterialRow[]>();

  for (const row of rows) {
    map.set(row.devolucion_id, [...(map.get(row.devolucion_id) ?? []), row]);
  }

  return map;
}

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

export default async function DevolucionesPage({ searchParams }: Props) {
  const profile = await requireRole([
    "admin",
    "devoluciones",
    "pesado",
    "inventario",
    "almacen",
  ]);

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
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const closeDetailHref = buildQuery(filters, page);
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
            <form action={createDevolucionAction} className="dx-form-grid">
              <input name="factura" required placeholder="Factura" />
              <input name="articulo" required placeholder="Articulo" />
              <input
                name="cantidad"
                required
                type="number"
                min="1"
                placeholder="Cantidad"
              />

              <select name="clasificacion" required defaultValue="bueno">
                <option value="bueno">Bueno</option>
                <option value="malo">Malo</option>
                <option value="mixto">Mixto</option>
              </select>

              <select name="flujo" required defaultValue="pesado">
                <option value="pesado">Pesado</option>
                <option value="almacen">Almacen</option>
              </select>

              <input
                name="transportistaNombre"
                required
                placeholder="Transportista"
              />
              <input
                name="transportistaCedula"
                required
                placeholder="Cedula transportista"
              />
              <input name="placaCamion" required placeholder="Placa" />

              <textarea
                name="descripcion"
                required
                placeholder="Descripcion del material"
                className="dx-col-span-all"
              />

              <EvidencePicker
                name="facturaEvidencia"
                label="Factura"
                required
              />
              <EvidencePicker
                name="materialEvidencia"
                label="Material / tarima"
                required
              />

              <button className="dx-submit dx-col-span-all">
                Crear devolucion
              </button>
            </form>
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
                  placeholder="Factura o articulo"
                />
              </label>

              <label>
                <span>Estado</span>
                <select name="estado" defaultValue={filters.estado}>
                  <option value="">Todos</option>
                  {Object.entries(STATE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Material</span>
                <select name="material" defaultValue={filters.material}>
                  <option value="">Todos</option>
                  <option value="bueno">Bueno</option>
                  <option value="malo">Malo</option>
                  <option value="mixto">Mixto</option>
                </select>
              </label>

              <label>
                <span>Flujo</span>
                <select name="flujo" defaultValue={filters.flujo}>
                  <option value="">Todos</option>
                  <option value="pesado">Pesado</option>
                  <option value="almacen">Almacen</option>
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
              <Link href="/devoluciones" className="v3-filter-clear">
                Limpiar filtros
              </Link>
            </form>

            <div className="v3-filter-foot">
              <span>{PAGE_SIZE} registros max.</span>
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
              No hay devoluciones para los filtros seleccionados.
            </div>
          ) : (
            <div className="v3-card-grid">
              {result.rows.map((row) => {
                const children = materialsByReturn.get(row.id) ?? [];
                const goodPending = children.filter(
                  (material) =>
                    material.tipo_material === "bueno" &&
                    material.estado === "pendiente_ubicar",
                );
                const badPending = children.filter(
                  (material) =>
                    material.tipo_material === "malo" &&
                    material.estado === "pendiente_disposicion",
                );

                const canReceive =
                  (profile.role === "admin" || profile.role === "pesado") &&
                  row.flujo_inicial === "pesado" &&
                  row.estado === "pendiente_entrega";

                const canInventory =
                  (profile.role === "admin" || profile.role === "inventario") &&
                  ["recibida_bodega", "pendiente_proceso"].includes(row.estado);

                const canLocate =
                  profile.role === "admin" ||
                  (profile.role === "pesado" &&
                    row.flujo_inicial === "pesado") ||
                  (profile.role === "almacen" &&
                    row.flujo_inicial === "almacen");

                const canDispose =
                  profile.role === "admin" || profile.role === "inventario";

                const detailHref = buildQuery(filters, page, {
                  detail: row.id,
                });

                return (
                  <article key={row.id} className="v3-case-card">
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

                    <div className="v3-card-date">
                      {formatDate(row.created_at)}
                    </div>

                    <footer className="v3-card-actions">
                      <Link
                        href={detailHref}
                        className="v3-card-primary-action"
                      >
                        Ver detalle
                      </Link>

                      <div className="v3-card-secondary-actions">
                        {canReceive ? (
                          <ModalShell
                            triggerLabel="Recepcion"
                            title={`Recepcion - ${row.factura}`}
                            description="Confirma cantidad, clasificacion y evidencias."
                            tone="primary"
                          >
                            <form
                              action={confirmReceptionAction}
                              className="dx-form-grid"
                            >
                              <input
                                type="hidden"
                                name="devolucionId"
                                value={row.id}
                              />
                              <input
                                name="cantidadRecibida"
                                type="number"
                                min="1"
                                required
                                placeholder="Cantidad recibida"
                              />
                              <select
                                name="clasificacion"
                                required
                                defaultValue="bueno"
                              >
                                <option value="bueno">Bueno</option>
                                <option value="malo">Malo</option>
                                <option value="mixto">Mixto</option>
                              </select>
                              <input
                                name="cantidadBueno"
                                type="number"
                                min="1"
                                placeholder="Cantidad bueno (Mixto)"
                              />
                              <input
                                name="cantidadMalo"
                                type="number"
                                min="1"
                                placeholder="Cantidad malo (Mixto)"
                              />
                              <input
                                name="observaciones"
                                placeholder="Observaciones"
                              />

                              <EvidencePicker
                                name="facturaFirmada"
                                label="Factura firmada"
                                required
                              />
                              <EvidencePicker
                                name="materialBueno"
                                label="Material bueno"
                              />
                              <EvidencePicker
                                name="materialMalo"
                                label="Material malo"
                              />

                              <button className="dx-submit dx-col-span-all">
                                Confirmar recepcion
                              </button>
                            </form>
                          </ModalShell>
                        ) : null}

                        {canInventory ? (
                          <ModalShell
                            triggerLabel="Inventario"
                            title={`Inventario - ${row.factura}`}
                            description="Registra pallet/control y separacion del material."
                            tone="primary"
                          >
                            <form
                              action={processInventoryAction}
                              className="dx-form-grid"
                            >
                              <input
                                type="hidden"
                                name="devolucionId"
                                value={row.id}
                              />
                              <input
                                required
                                name="palletCodigo"
                                placeholder="Pallet / control"
                              />
                              <input
                                name="observaciones"
                                placeholder="Observaciones"
                              />
                              <input
                                name="cantidadBueno"
                                type="number"
                                min="1"
                                placeholder="Cantidad bueno (Mixto)"
                              />
                              <input
                                name="cantidadMalo"
                                type="number"
                                min="1"
                                placeholder="Cantidad malo (Mixto)"
                              />

                              <EvidencePicker
                                name="evidencia"
                                label="Evidencia de inventario"
                                required
                              />

                              <button className="dx-submit dx-col-span-all">
                                Procesar inventario
                              </button>
                            </form>
                          </ModalShell>
                        ) : null}

                        {canLocate
                          ? goodPending.map((material) => (
                              <ModalShell
                                key={material.id}
                                triggerLabel="Ubicar"
                                title={`Ubicacion - ${row.factura}`}
                                description={`${material.cantidad} unidades de material bueno.`}
                                tone="primary"
                              >
                                <form
                                  action={locateMaterialAction}
                                  className="dx-form-grid"
                                >
                                  <input
                                    type="hidden"
                                    name="materialId"
                                    value={material.id}
                                  />
                                  <input
                                    required
                                    name="ubicacion"
                                    placeholder="Ubicacion final"
                                  />
                                  <input
                                    name="observaciones"
                                    placeholder="Observaciones"
                                  />

                                  <EvidencePicker
                                    name="evidencia"
                                    label="Evidencia de ubicacion"
                                  />

                                  <button className="dx-submit dx-col-span-all">
                                    Cerrar material bueno
                                  </button>
                                </form>
                              </ModalShell>
                            ))
                          : null}

                        {canDispose
                          ? badPending.map((material) => (
                              <ModalShell
                                key={material.id}
                                triggerLabel="Disponer"
                                title={`Disposicion - ${row.factura}`}
                                description={`${material.cantidad} unidades de material malo.`}
                                tone="danger"
                              >
                                <form
                                  action={disposeMaterialAction}
                                  className="dx-form-grid"
                                >
                                  <input
                                    type="hidden"
                                    name="materialId"
                                    value={material.id}
                                  />
                                  <input
                                    required
                                    name="decisionFinal"
                                    placeholder="Decision final"
                                  />
                                  <textarea
                                    required
                                    name="observaciones"
                                    placeholder="Observaciones de disposicion"
                                  />

                                  <EvidencePicker
                                    name="evidencia"
                                    label="Evidencia de disposicion"
                                    required
                                  />

                                  <button className="dx-submit danger dx-col-span-all">
                                    Registrar disposicion
                                  </button>
                                </form>
                              </ModalShell>
                            ))
                          : null}

                        {profile.role === "admin" ? (
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
                              <input
                                type="hidden"
                                name="devolucionId"
                                value={row.id}
                              />
                              <button
                                className="dx-confirm-delete"
                                type="submit"
                              >
                                Eliminar definitivamente
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

          <nav
            className="v3-pagination v5-pagination"
            aria-label="Paginacion de devoluciones"
          >
            {result.page > 1 ? (
              <Link href={buildQuery(filters, result.page - 1)}>Anterior</Link>
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
                    href={buildQuery(filters, item)}
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
              <Link href={buildQuery(filters, result.page + 1)}>Siguiente</Link>
            ) : (
              <span className="disabled">Siguiente</span>
            )}
          </nav>
        </section>
      </section>

      {detail?.parent ? (
        <div className="dx-route-modal">
          <section className="dx-route-modal-card dv-glass">
            <header className="dx-modal-header">
              <div>
                <span>Detalle de devolucion</span>
                <h2>
                  {detail.parent.factura} | {detail.parent.articulo}
                </h2>
                <p>
                  Estado:{" "}
                  {STATE_LABELS[detail.parent.estado] ?? detail.parent.estado}
                </p>
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
                    <span>Cantidad</span>
                    <strong>{detail.parent.cantidad}</strong>
                  </div>
                  <div>
                    <span>Material inicial</span>
                    <strong>{detail.parent.estado_material}</strong>
                  </div>
                  <div>
                    <span>Flujo</span>
                    <strong>{detail.parent.flujo_inicial}</strong>
                  </div>
                  <div>
                    <span>Transportista</span>
                    <strong>{detail.parent.transportista_nombre || "-"}</strong>
                  </div>
                  <div>
                    <span>Cedula</span>
                    <strong>{detail.parent.transportista_cedula || "-"}</strong>
                  </div>
                  <div>
                    <span>Placa</span>
                    <strong>{detail.parent.placa_camion || "-"}</strong>
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
      ) : null}
    </main>
  );
}
