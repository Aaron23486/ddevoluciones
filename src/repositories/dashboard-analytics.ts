import "server-only";

import {
  addDays,
  isoDate,
  resolvePeriod,
} from "@/domain/reports/dashboard-period";
import {
  buildExecutiveDashboard,
  type CargaFact,
  type DevolucionFact,
} from "@/domain/reports/dashboard-snapshot";
import { createClient } from "@/lib/supabase/server";
import type { ExecutiveDashboardData } from "@/types/dashboard";

async function fetchAllDevoluciones(
  combinedFrom: string,
  combinedToExclusive: string,
): Promise<DevolucionFact[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const rows: DevolucionFact[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("devoluciones")
      .select(
        "id,factura,articulo,cantidad,estado_material,transportista_nombre,placa_camion,estado,created_at,cerrado_at,flujo_inicial",
      )
      .gte("created_at", combinedFrom)
      .lt("created_at", combinedToExclusive)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as DevolucionFact[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchAllCarga(
  combinedFrom: string,
  combinedToExclusive: string,
): Promise<CargaFact[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const rows: CargaFact[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("reportes_carga")
      .select(
        "id,numero_documento,factura,cliente,articulo,cantidad,transportista,ruta,placa,motivo_no_entrega,estado_fisico_carga,estado,recibido_at,redespachado_at,created_at",
      )
      .eq("is_active", true)
      .gte("created_at", combinedFrom)
      .lt("created_at", combinedToExclusive)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as CargaFact[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

export async function getExecutiveDashboardData(input: {
  days?: number;
  from?: string;
  to?: string;
  includeCarga: boolean;
}): Promise<ExecutiveDashboardData> {
  const period = resolvePeriod(input);

  const combinedFrom = `${period.previousFrom}T00:00:00.000Z`;
  const combinedToExclusive = `${isoDate(addDays(new Date(`${period.to}T00:00:00.000Z`), 1))}T00:00:00.000Z`;

  const [devolucionesRows, cargaRows] = await Promise.all([
    fetchAllDevoluciones(combinedFrom, combinedToExclusive),
    input.includeCarga
      ? fetchAllCarga(combinedFrom, combinedToExclusive)
      : Promise.resolve([]),
  ]);

  return buildExecutiveDashboard({
    period,
    devolucionesRows,
    cargaRows,
    includeCarga: input.includeCarga,
  });
}
