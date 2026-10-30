// Utilidades compartidas por las páginas de listado (devoluciones y reportes de carga):
// lectura de parámetros de búsqueda, enlaces de filtros y paginación, y fechas.

export type SearchParamValue = string | string[] | undefined;

export function one(value: SearchParamValue): string {
  return typeof value === "string" ? value : "";
}

export function validUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

// Enlace a la página con los filtros no vacíos, la página (si no es la primera) y extras.
export function buildListHref(
  basePath: string,
  filters: Record<string, string>,
  page: number,
  extra?: Record<string, string>,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }

  if (page > 1) query.set("page", String(page));

  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) query.set(key, value);
  }

  const text = query.toString();
  return text ? `?${text}` : basePath;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

// Páginas a mostrar: todas si son 7 o menos; si no, la primera, la última y las vecinas
// de la actual, con «ellipsis» en los saltos.
export function paginationItems(
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
