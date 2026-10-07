import { createClient } from "@/lib/supabase/server";

export const REPORTE_CARGA_PAGE_SIZE = 10;

export type ReporteCargaRow = {
  id: string;
  numero_documento: string | null;
  factura: string | null;
  cliente: string;
  articulo: string | null;
  descripcion_material: string | null;
  cantidad: number;
  transportista: string | null;
  ruta: string | null;
  placa: string | null;
  motivo_no_entrega: string;
  estado_fisico_carga: string | null;
  observaciones_retorno: string | null;
  estado: "recibido_muelle" | "pendiente_redespacho" | "redespachado";
  recibido_por: string | null;
  recibido_at: string | null;
  redespachado_por: string | null;
  redespachado_at: string | null;
  observaciones_redespacho: string | null;
  conductor_envio: string | null;
  placa_envio: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ReporteCargaHistoryRow = {
  id: string;
  reporte_carga_id: string;
  accion:
    | "retorno_registrado"
    | "estado_actualizado"
    | "redespacho_registrado"
    | "reporte_anulado";
  estado_anterior: string | null;
  estado_nuevo: string | null;
  usuario_nombre: string | null;
  observacion: string | null;
  created_at: string;
};

export type ReporteCargaEvidenceRow = {
  id: string;
  reporte_carga_id: string;
  tipo: string;
  url: string;
  descripcion: string | null;
  created_at: string;
};

export type ReporteCargaMetrics = {
  total: number;
  recibido_muelle: number;
  pendiente_redespacho: number;
  redespachado: number;
  tasa_reenvio: number;
};

export async function searchReportesCarga(input: {
  search?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  page?: number;
}) {
  const page = Math.max(input.page ?? 1, 1);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("buscar_reportes_carga_ep4", {
    p_search: input.search || null,
    p_estado: input.estado || null,
    p_desde: input.desde || null,
    p_hasta: input.hasta || null,
    p_limit: REPORTE_CARGA_PAGE_SIZE + 1,
    p_offset: (page - 1) * REPORTE_CARGA_PAGE_SIZE,
  });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ReporteCargaRow[];

  return {
    rows: rows.slice(0, REPORTE_CARGA_PAGE_SIZE),
    page,
    hasNext: rows.length > REPORTE_CARGA_PAGE_SIZE,
  };
}

export async function getReportesCargaMetrics(input: {
  search?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
}): Promise<ReporteCargaMetrics> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("reportes_carga_metricas_ep4", {
    p_search: input.search || null,
    p_estado: input.estado || null,
    p_desde: input.desde || null,
    p_hasta: input.hasta || null,
  });

  if (error) throw new Error(error.message);

  return (data ?? {
    total: 0,
    recibido_muelle: 0,
    pendiente_redespacho: 0,
    redespachado: 0,
    tasa_reenvio: 0,
  }) as ReporteCargaMetrics;
}

export async function getReportesCargaDetails(ids: readonly string[]) {
  if (ids.length === 0) {
    return {
      history: [] as ReporteCargaHistoryRow[],
      evidence: [] as ReporteCargaEvidenceRow[],
    };
  }

  const supabase = await createClient();

  const [historyResult, evidenceResult] = await Promise.all([
    supabase
      .from("reportes_carga_historial")
      .select("id,reporte_carga_id,accion,estado_anterior,estado_nuevo,usuario_nombre,observacion,created_at")
      .in("reporte_carga_id", [...ids])
      .order("created_at", { ascending: true }),
    supabase
      .from("reportes_carga_evidencias")
      .select("id,reporte_carga_id,tipo,url,descripcion,created_at")
      .in("reporte_carga_id", [...ids])
      .order("created_at", { ascending: true }),
  ]);

  if (historyResult.error) throw new Error(historyResult.error.message);
  if (evidenceResult.error) throw new Error(evidenceResult.error.message);

  return {
    history: (historyResult.data ?? []) as ReporteCargaHistoryRow[],
    evidence: (evidenceResult.data ?? []) as ReporteCargaEvidenceRow[],
  };
}