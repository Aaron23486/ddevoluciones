import { describe, expect, it } from "vitest";
import { REQUESTABLE_ROLES, USER_ROLES } from "@/constants/roles";

const expectedRoles = [
  "admin",
  "devoluciones",
  "pesado",
  "inventario",
  "almacen",
  "transportes",
  "seguridad",
];

describe("role contract", () => {
  it("contains exactly the seven confirmed application roles", () => {
    expect([...USER_ROLES]).toEqual(expectedRoles);
  });

  it("public registration exposes only the four confirmed requestable roles", () => {
    expect([...REQUESTABLE_ROLES]).toEqual([
      "devoluciones",
      "pesado",
      "inventario",
      "almacen",
    ]);
  });
});
