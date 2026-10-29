import { describe, expect, it } from "vitest";
import { FINAL_NAVIGATION_BY_ROLE } from "@/constants/final-navigation";

describe("epica 5 premium UI UX contract", () => {
  it("keeps only the four final application destinations", () => {
    const allowed = new Set([
      "/dashboard",
      "/devoluciones",
      "/reportes-carga",
      "/usuarios",
    ]);

    for (const links of Object.values(FINAL_NAVIGATION_BY_ROLE)) {
      for (const link of links) {
        expect(allowed.has(link.href)).toBe(true);
      }
    }
  });

  it("keeps admin full final navigation", () => {
    expect(FINAL_NAVIGATION_BY_ROLE.admin.map((item) => item.href)).toEqual([
      "/dashboard",
      "/devoluciones",
      "/reportes-carga",
      "/usuarios",
    ]);
  });
});
