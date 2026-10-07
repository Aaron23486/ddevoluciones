import { createClient } from "@/lib/supabase/server";

export type MetricItem = {
  key: string;
  count: number;
};

export type TrendItem = {
  mes: string;
  modulo: string;
  count: number;
};

export type OperationalCase = {
  id: string;
  modulo: "devoluciones" | "reporte_carga";
  referencia: string;
  estado: string;
  bucket: string;
  flujo: string | null;
  material: string | null;
  fecha: string;
  has_evidence: boolean;
};

export type OperationalAnalytics = {
  total: number;
  entrada: number;
  en_proceso: number;
  pendiente_accion: number;
  resuelto: number;
  casos_seguimiento: number;
  efectividad: number;
  trazabilidad: number;
  por_modulo: MetricItem[];
  por_flujo: MetricItem[];
  por_material: MetricItem[];
  estados_devoluciones: MetricItem[];
  estados_reporte_carga: MetricItem[];
  tendencia: TrendItem[];
  casos: OperationalCase[];
};

export async function getOperationalAnalytics(filters: {
  bucket?: string;
  modulo?: string;
  estadoDevolucion?: string;
  flujo?: string;
  material?: string;
  mes?: string;
  estadoReporte?: string;
}): Promise<OperationalAnalytics> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_operational_analytics_ep4", {
    p_bucket: filters.bucket || null,
    p_modulo: filters.modulo || null,
    p_estado_devolucion: filters.estadoDevolucion || null,
    p_flujo: filters.flujo || null,
    p_material: filters.material || null,
    p_mes: filters.mes || null,
    p_estado_reporte: filters.estadoReporte || null,
  });

  if (error) throw new Error(error.message);

  return (data ?? {
    total: 0,
    entrada: 0,
    en_proceso: 0,
    pendiente_accion: 0,
    resuelto: 0,
    casos_seguimiento: 0,
    efectividad: 0,
    trazabilidad: 0,
    por_modulo: [],
    por_flujo: [],
    por_material: [],
    estados_devoluciones: [],
    estados_reporte_carga: [],
    tendencia: [],
    casos: [],
  }) as OperationalAnalytics;
}