import Link from "next/link";

export type ReporteCargaFilterValues = {
  search: string;
  estado: string;
  desde: string;
  hasta: string;
};

// Panel de filtros del listado de reportes de carga (formulario GET).
export function ReporteCargaFilters({
  filters,
  pageSize,
  page,
}: {
  filters: ReporteCargaFilterValues;
  pageSize: number;
  page: number;
}) {
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
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
              <option value="pendiente_redespacho">Pendiente de envio</option>
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
          <span>{pageSize} registros max.</span>
          <span>Pagina {page}</span>
        </div>
      </div>
    </aside>
  );
}
