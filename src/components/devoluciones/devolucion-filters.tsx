import Link from "next/link";

import { STATE_LABELS } from "@/lib/devoluciones/case-actions";

export type DevolucionFilterValues = {
  search: string;
  estado: string;
  material: string;
  flujo: string;
  desde: string;
  hasta: string;
};

type Props = {
  filters: DevolucionFilterValues;
  pageSize: number;
  page: number;
};

// Panel de filtros del listado de devoluciones (formulario GET).
export function DevolucionFilters({ filters, pageSize, page }: Props) {
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
          <span>{pageSize} registros max.</span>
          <span>Pagina {page}</span>
        </div>
      </div>
    </aside>
  );
}
