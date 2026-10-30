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

describe("roles (contrato)", () => {
  it("contiene exactamente los siete roles de la aplicación", () => {
    expect([...USER_ROLES]).toEqual(expectedRoles);
  });
});
