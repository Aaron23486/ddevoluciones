import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 10;

export type DevolucionSearchRow = {
  id: string;
  factura: string;
  articulo: string;
  cantidad: number;
  estado_material: string;
  descripcion_material: string;
  transportista_nombre: string | null;
  transportista_cedula: string | null;
  placa_camion: string | null;
  estado: string;
  foto_factura_url: string | null;
  foto_tarima_url: string | null;
  foto_material_url: string | null;
  flujo_inicial: string;
  creado_por: string | null;
  recibido_por: string | null;
  pallet_por: string | null;
  ubicado_por: string | null;
  disposicion_por: string | null;
  cerrado_por: string | null;
  recibido_at: string | null;
  pallet_at: string | null;
  ubicado_at: string | null;
  disposicion_at: string | null;
  cerrado_at: string | null;
  recepcion_validada: boolean;
  recepcion_observaciones: string | null;
  recepcion_cantidad_recibida: number | null;
  recepcion_validada_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DevolucionMaterialRow = {
  id: string;
  devolucion_id: string;
  tipo_material: "bueno" | "malo";
  cantidad: number;
  estado: string;
  descripcion: string | null;
  pallet_codigo: string | null;
  ubicacion: string | null;
  observaciones: string | null;
  decision_final: string | null;
  created_at: string;
  cerrado_at: string | null;
};

export type DevolucionEvidenceRow = {
  id: string;
  devolucion_id: string;
  material_id: string | null;
  etapa: string;
  tipo: string;
  url: string;
  descripcion: string | null;
  created_at: string;
};

export type DevolucionHistoryRow = {
  id: string;
  devolucion_id: string;
  material_id: string | null;
  accion: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  detalles: unknown;
  created_at: string;
};

export async function searchDevoluciones(input: {
  search?: string;
  estado?: string;
  material?: string;
  flujo?: string;
  desde?: string;
  hasta?: string;
  page?: number;
}) {
  const page = Math.max(input.page ?? 1, 1);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("buscar_devoluciones", {
    p_search: input.search || null,
    p_estado: input.estado || null,
    p_material: input.material || null,
    p_flujo: input.flujo || null,
    p_desde: input.desde || null,
    p_hasta: input.hasta || null,
    p_limit: PAGE_SIZE + 1,
    p_offset: (page - 1) * PAGE_SIZE,
  });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as DevolucionSearchRow[];

  return {
    rows: rows.slice(0, PAGE_SIZE),
    page,
    hasNext: rows.length > PAGE_SIZE,
  };
}

// === DEVOLUCIONES STATE METRICS START ===

export type DevolucionStateMetrics = {
  pendiente_entrega: number;
  pendiente_proceso: number;
  recibida_bodega: number;
  pendiente_ubicar: number;
  pendiente_disposicion: number;
  cerrada: number;
};

const DEVOLUCION_STATES = [
  "pendiente_entrega",
  "pendiente_proceso",
  "recibida_bodega",
  "pendiente_ubicar",
  "pendiente_disposicion",
  "cerrada",
] as const;

export async function getDevolucionStateMetrics(): Promise<DevolucionStateMetrics> {
  const supabase = await createClient();

  const results = await Promise.all(
    DEVOLUCION_STATES.map((estado) =>
      supabase
        .from("devoluciones")
        .select("id", { count: "exact", head: true })
        .eq("estado", estado),
    ),
  );

  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    pendiente_entrega: results[0].count ?? 0,
    pendiente_proceso: results[1].count ?? 0,
    recibida_bodega: results[2].count ?? 0,
    pendiente_ubicar: results[3].count ?? 0,
    pendiente_disposicion: results[4].count ?? 0,
    cerrada: results[5].count ?? 0,
  };
}

// === DEVOLUCIONES STATE METRICS END ===

// === FILTERED DEVOLUCIONES COUNT START ===

export async function getDevolucionFilteredCount(input: {
  search?: string;
  estado?: string;
  material?: string;
  flujo?: string;
  desde?: string;
  hasta?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("devoluciones")
    .select("id", { count: "exact", head: true });

  const search = input.search?.trim();

  if (search) {
    const escaped = search.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

    query = query.or(
      `factura.ilike."%${escaped}%",articulo.ilike."%${escaped}%"`,
    );
  }

  if (input.estado?.trim()) {
    query = query.eq("estado", input.estado.trim());
  }

  if (input.material?.trim()) {
    query = query.eq("estado_material", input.material.trim());
  }

  if (input.flujo?.trim()) {
    query = query.eq("flujo_inicial", input.flujo.trim());
  }

  if (input.desde) {
    query = query.gte("created_at", `${input.desde}T00:00:00.000Z`);
  }

  if (input.hasta) {
    const nextDay = new Date(`${input.hasta}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    query = query.lt("created_at", nextDay.toISOString());
  }

  const { count, error } = await query;

  if (error) throw new Error(error.message);

  return count ?? 0;
}

// === FILTERED DEVOLUCIONES COUNT END ===

export async function getMaterialsForDevoluciones(ids: readonly string[]) {
  if (ids.length === 0) return [] as DevolucionMaterialRow[];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devolucion_materiales")
    .select(
      "id,devolucion_id,tipo_material,cantidad,estado,descripcion,pallet_codigo,ubicacion,observaciones,decision_final,created_at,cerrado_at",
    )
    .in("devolucion_id", [...ids])
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DevolucionMaterialRow[];
}

export async function getDevolucionDetail(id: string) {
  const supabase = await createClient();

  const [parentResult, materialsResult, evidenceResult, historyResult] =
    await Promise.all([
      supabase.from("devoluciones").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("devolucion_materiales")
        .select(
          "id,devolucion_id,tipo_material,cantidad,estado,descripcion,pallet_codigo,ubicacion,observaciones,decision_final,created_at,cerrado_at",
        )
        .eq("devolucion_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("devolucion_evidencias")
        .select(
          "id,devolucion_id,material_id,etapa,tipo,url,descripcion,created_at",
        )
        .eq("devolucion_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("devolucion_historial")
        .select(
          "id,devolucion_id,material_id,accion,estado_anterior,estado_nuevo,detalles,created_at",
        )
        .eq("devolucion_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (parentResult.error) throw new Error(parentResult.error.message);
  if (materialsResult.error) throw new Error(materialsResult.error.message);
  if (evidenceResult.error) throw new Error(evidenceResult.error.message);
  if (historyResult.error) throw new Error(historyResult.error.message);

  return {
    parent: (parentResult.data ?? null) as DevolucionSearchRow | null,
    materials: (materialsResult.data ?? []) as DevolucionMaterialRow[],
    evidence: (evidenceResult.data ?? []) as DevolucionEvidenceRow[],
    history: (historyResult.data ?? []) as DevolucionHistoryRow[],
  };
}

export async function listReceptionQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devoluciones")
    .select(
      "id,factura,articulo,cantidad,estado_material,descripcion_material,created_at",
    )
    .eq("flujo_inicial", "pesado")
    .eq("estado", "pendiente_entrega")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInventoryQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devoluciones")
    .select(
      "id,factura,articulo,cantidad,estado_material,flujo_inicial,estado,created_at",
    )
    .in("estado", ["recibida_bodega", "pendiente_proceso"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listLocationQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devolucion_materiales")
    .select(
      "id,cantidad,pallet_codigo,observaciones,devolucion_id,devoluciones!inner(id,factura,articulo,flujo_inicial)",
    )
    .eq("tipo_material", "bueno")
    .eq("estado", "pendiente_ubicar")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDispositionQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devolucion_materiales")
    .select(
      "id,cantidad,pallet_codigo,observaciones,devolucion_id,devoluciones!inner(id,factura,articulo,flujo_inicial)",
    )
    .eq("tipo_material", "malo")
    .eq("estado", "pendiente_disposicion")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}
