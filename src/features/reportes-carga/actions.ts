"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  annulReporteCargaSchema,
  createReporteCargaSchema,
  redispatchReporteCargaSchema,
} from "@/schemas/reportes-carga";
import {
  assertEvidenceFile,
  removeEvidencePaths,
  uploadEvidence,
} from "@/services/evidence-storage";

function fail(code: string): never {
  redirect(`/reportes-carga?error=${encodeURIComponent(code)}`);
}

function ok(code: string): never {
  redirect(`/reportes-carga?success=${encodeURIComponent(code)}`);
}

export async function createReporteCargaAction(formData: FormData) {
  const profile = await requireRole([
    "admin",
    "inventario",
    "transportes",
    "seguridad",
  ]);

  const parsed = createReporteCargaSchema.safeParse({
    numeroDocumento: formData.get("numeroDocumento"),
    factura: formData.get("factura"),
    cliente: formData.get("cliente"),
    articulo: formData.get("articulo"),
    descripcionMaterial: formData.get("descripcionMaterial"),
    cantidad: formData.get("cantidad"),
    transportista: formData.get("transportista"),
    ruta: formData.get("ruta"),
    placa: formData.get("placa"),
    motivoNoEntrega: formData.get("motivoNoEntrega"),
    estadoFisicoCarga: formData.get("estadoFisicoCarga"),
    observacionesRetorno: formData.get("observacionesRetorno"),
  });

  if (!parsed.success) fail("validation");

  let evidence: File;
  try {
    evidence = assertEvidenceFile(
      formData.get("evidenciaRecepcion"),
      "Evidencia de recepcion",
    )!;
  } catch {
    fail("evidence_validation");
  }

  const supabase = await createClient();
  const uploaded: string[] = [];

  try {
    const evidencePath = await uploadEvidence(
      supabase,
      profile.id,
      `reportes-carga/create-${crypto.randomUUID()}`,
      "recepcion",
      evidence,
    );
    uploaded.push(evidencePath);

    const { error } = await supabase.rpc("crear_reporte_carga_ep4", {
      p_numero_documento: parsed.data.numeroDocumento ?? null,
      p_factura: parsed.data.factura ?? null,
      p_cliente: parsed.data.cliente,
      p_articulo: parsed.data.articulo,
      p_descripcion_material: parsed.data.descripcionMaterial ?? null,
      p_cantidad: parsed.data.cantidad,
      p_transportista: parsed.data.transportista ?? null,
      p_ruta: parsed.data.ruta ?? null,
      p_placa: parsed.data.placa ?? null,
      p_motivo_no_entrega: parsed.data.motivoNoEntrega,
      p_estado_fisico_carga: parsed.data.estadoFisicoCarga,
      p_observaciones_retorno: parsed.data.observacionesRetorno ?? null,
      p_evidencia_path: evidencePath,
    });

    if (error) throw error;
  } catch {
    await removeEvidencePaths(supabase, uploaded);
    fail("create_failed");
  }

  revalidatePath("/reportes-carga");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  ok("created");
}

export async function redispatchReporteCargaAction(formData: FormData) {
  const profile = await requireRole(["admin", "inventario"]);

  const parsed = redispatchReporteCargaSchema.safeParse({
    reporteCargaId: formData.get("reporteCargaId"),
    conductor: formData.get("conductor"),
    placaSalida: formData.get("placaSalida"),
    observaciones: formData.get("observaciones"),
  });

  if (!parsed.success) fail("redispatch_validation");

  let evidence: File;
  try {
    evidence = assertEvidenceFile(
      formData.get("evidenciaRedespacho"),
      "Evidencia de redespacho",
    )!;
  } catch {
    fail("evidence_validation");
  }

  const supabase = await createClient();
  const uploaded: string[] = [];

  try {
    const evidencePath = await uploadEvidence(
      supabase,
      profile.id,
      `reportes-carga/${parsed.data.reporteCargaId}`,
      "redespacho",
      evidence,
    );
    uploaded.push(evidencePath);

    const { error } = await supabase.rpc("redespachar_reporte_carga_ep4", {
      p_reporte_carga_id: parsed.data.reporteCargaId,
      p_conductor: parsed.data.conductor,
      p_placa_salida: parsed.data.placaSalida,
      p_observaciones: parsed.data.observaciones,
      p_evidencia_path: evidencePath,
    });

    if (error) throw error;
  } catch {
    await removeEvidencePaths(supabase, uploaded);
    fail("redispatch_failed");
  }

  revalidatePath("/reportes-carga");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  ok("redispatched");
}

export async function annulReporteCargaAction(formData: FormData) {
  await requireRole(["admin"]);

  const parsed = annulReporteCargaSchema.safeParse({
    reporteCargaId: formData.get("reporteCargaId"),
  });

  if (!parsed.success) fail("invalid_id");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("anular_reporte_carga_ep4", {
    p_reporte_carga_id: parsed.data.reporteCargaId,
  });

  if (error || data !== true) fail("annul_failed");

  revalidatePath("/reportes-carga");
  revalidatePath("/dashboard");
  ok("annulled");
}
