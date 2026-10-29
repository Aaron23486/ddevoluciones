import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202610070001_admin_hitos_operativos.sql",
  ),
  "utf8",
);

describe("admin operational notification migration contract", () => {
  it("keeps original operational audience and creates one admin copy", () => {
    expect(sql).toContain("new.target_role not in ('pesado', 'inventario')");
    expect(sql).toContain("'devolucion_creada'");
    expect(sql).toContain("'admin'");
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toContain("create unique index if not exists");
  });

  it("does not weaken access policies or overwrite the operational RPC", () => {
    expect(sql).not.toMatch(
      /create\s+policy|alter\s+policy|grant\s+select\s+on\s+public\.internal_notifications/i,
    );
    expect(sql).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.crear_devolucion/i,
    );
    expect(sql).not.toMatch(/drop\s+table|truncate\s+table/i);
  });

  it("does not copy report alerts or existing close alerts", () => {
    expect(sql).not.toContain("reporte_carga_enviado");
    expect(sql).not.toContain("reporte_carga_pendiente_envio");
    expect(sql).not.toContain("devolucion_cerrada");
  });
});
