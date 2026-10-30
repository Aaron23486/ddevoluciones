import { describe, expect, it } from "vitest";

import {
  buildListHref,
  formatDate,
  one,
  paginationItems,
  validUuid,
} from "./list-page";

describe("páginas de listado", () => {
  it("toma solo valores simples de los parámetros", () => {
    expect(one("pesado")).toBe("pesado");
    expect(one(["a", "b"])).toBe("");
    expect(one(undefined)).toBe("");
  });

  it("reconoce identificadores con forma de UUID", () => {
    expect(validUuid("4b7d8f0e-2a1c-4e5b-9f6a-1c2d3e4f5a6b")).toBe(true);
    expect(validUuid("1; drop table")).toBe(false);
  });

  it("arma el enlace con los filtros no vacíos, la página y los extras", () => {
    expect(buildListHref("/devoluciones", { search: "", estado: "" }, 1)).toBe(
      "/devoluciones",
    );
    expect(
      buildListHref("/devoluciones", { search: "F-1", estado: "" }, 3, {
        detail: "abc",
      }),
    ).toBe("?search=F-1&page=3&detail=abc");
  });

  it("muestra la fecha corta o un guion", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("2026-10-29T12:00:00Z")).toMatch(/2026/);
  });

  it("pagina con elipsis solo cuando hay más de siete páginas", () => {
    expect(paginationItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationItems(6, 12)).toEqual([
      1,
      "ellipsis",
      5,
      6,
      7,
      "ellipsis",
      12,
    ]);
    expect(paginationItems(1, 12)).toEqual([1, 2, "ellipsis", 12]);
  });
});
