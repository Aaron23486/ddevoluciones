import Link from "next/link";

import { paginationItems } from "@/lib/list-page";

type Props = {
  page: number;
  totalPages: number;
  label: string;
  hrefFor: (page: number) => string;
};

// Paginación de los listados: anterior/siguiente, páginas cercanas y total.
export function ListPagination({ page, totalPages, label, hrefFor }: Props) {
  return (
    <nav className="v3-pagination v5-pagination" aria-label={label}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)}>Anterior</Link>
      ) : (
        <span className="disabled">Anterior</span>
      )}

      <div className="v5-page-list">
        {paginationItems(page, totalPages).map((item, index) =>
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
              href={hrefFor(item)}
              className={item === page ? "active" : ""}
              aria-current={item === page ? "page" : undefined}
            >
              {item}
            </Link>
          ),
        )}
      </div>

      <strong>
        Pagina {page} de {totalPages}
      </strong>

      {page < totalPages ? (
        <Link href={hrefFor(page + 1)}>Siguiente</Link>
      ) : (
        <span className="disabled">Siguiente</span>
      )}
    </nav>
  );
}
