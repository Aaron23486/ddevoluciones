import { describe, expect, it } from "vitest";
import { USER_ROLES } from "@/constants/roles";

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
});
