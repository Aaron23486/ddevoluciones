"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  createDevolucionSchema,
  dispositionSchema,
  inventorySchema,
  locationSchema,
  receptionSchema,
} from "@/schemas/devoluciones";
import {
  assertEvidenceFile,
  removeEvidencePaths,
  uploadEvidence,
} from "@/services/evidence-storage";

function fail(path: string, code: string): never {
  redirect(`${path}?error=${encodeURIComponent(code)}`);
}

function ok(path: string, code: string): never {
  redirect(`${path}?success=${encodeURIComponent(code)}`);
}

export async function createDevolucionAction(formData: FormData) {
  const profile = await requireRole(["admin", "devoluciones"]);
  const parsed = createDevolucionSchema.safeParse({
    factura: formData.get("factura"),
    articulo: formData.get("articulo"),
    cantidad: formData.get("cantidad"),
    clasificacion: formData.get("clasificacion"),
    descripcion: formData.get("descripcion"),
    flujo: formData.get("flujo"),
    transportistaNombre: formData.get("transportistaNombre"),
    transportistaCedula: formData.get("transportistaCedula"),
    placaCamion: formData.get("placaCamion"),
  });

  if (!parsed.success) fail("/devoluciones", "validation");

  let facturaFile: File;
  let materialFile: File;

  try {
    facturaFile = assertEvidenceFile(formData.get("facturaEvidencia"), "Factura")!;
    materialFile = assertEvidenceFile(formData.get("materialEvidencia"), "Material")!;
  } catch {
    fail("/devoluciones", "evidence_validation");
  }

  const supabase = await createClient();
  const groupId = `create-${crypto.randomUUID()}`;
  const uploaded: string[] = [];

  try {
    const facturaPath = await uploadEvidence(supabase, profile.id, groupId, "factura", facturaFile);
    uploaded.push(facturaPath);

    const materialPath = await uploadEvidence(supabase, profile.id, groupId, "material", materialFile);
    uploaded.push(materialPath);

    const { error } = await supabase.rpc("crear_devolucion", {
      p_factura: parsed.data.factura,
      p_articulo: parsed.data.articulo,
      p_cantidad: parsed.data.cantidad,
      p_clasificacion: parsed.data.clasificacion,
      p_descripcion: parsed.data.descripcion,
      p_flujo: parsed.data.flujo,
      p_transportista_nombre: parsed.data.transportistaNombre,
      p_transportista_cedula: parsed.data.transportistaCedula,
      p_placa_camion: parsed.data.placaCamion,
      p_factura_path: facturaPath,
      p_material_path: materialPath,
    });

    if (error) throw error;
  } catch {
    await removeEvidencePaths(supabase, uploaded);
    fail("/devoluciones", "create_failed");
  }

  revalidatePath("/devoluciones");
  ok("/devoluciones", "created");
}

export async function confirmReceptionAction(formData: FormData) {
  const profile = await requireRole(["admin", "pesado"]);
  const parsed = receptionSchema.safeParse({
    devolucionId: formData.get("devolucionId"),
    cantidadRecibida: formData.get("cantidadRecibida"),
    clasificacion: formData.get("clasificacion"),
    cantidadBueno: formData.get("cantidadBueno"),
    cantidadMalo: formData.get("cantidadMalo"),
    observaciones: formData.get("observaciones"),
  });

  if (!parsed.success) fail("/devoluciones", "validation");

  let signedInvoice: File;
  let goodFile: File | null;
  let badFile: File | null;

  try {
    signedInvoice = assertEvidenceFile(formData.get("facturaFirmada"), "Factura firmada")!;
    goodFile = assertEvidenceFile(
      formData.get("materialBueno"),
      "Material bueno",
      parsed.data.clasificacion === "bueno" || parsed.data.clasificacion === "mixto",
    );
    badFile = assertEvidenceFile(
      formData.get("materialMalo"),
      "Material malo",
      parsed.data.clasificacion === "malo" || parsed.data.clasificacion === "mixto",
    );
  } catch {
    fail("/devoluciones", "evidence_validation");
  }

  const supabase = await createClient();
  const groupId = parsed.data.devolucionId;
  const uploaded: string[] = [];

  try {
    const signedPath = await uploadEvidence(supabase, profile.id, groupId, "factura-firmada", signedInvoice);
    uploaded.push(signedPath);

    const goodPath = goodFile
      ? await uploadEvidence(supabase, profile.id, groupId, "material-bueno", goodFile)
      : null;
    if (goodPath) uploaded.push(goodPath);

    const badPath = badFile
      ? await uploadEvidence(supabase, profile.id, groupId, "material-malo", badFile)
      : null;
    if (badPath) uploaded.push(badPath);

    const { error } = await supabase.rpc("confirmar_recepcion_devolucion", {
      p_devolucion_id: parsed.data.devolucionId,
      p_cantidad_recibida: parsed.data.cantidadRecibida,
      p_clasificacion: parsed.data.clasificacion,
      p_cantidad_bueno: parsed.data.cantidadBueno ?? null,
      p_cantidad_malo: parsed.data.cantidadMalo ?? null,
      p_observaciones: parsed.data.observaciones || null,
      p_factura_firmada_path: signedPath,
      p_material_bueno_path: goodPath,
      p_material_malo_path: badPath,
    });

    if (error) throw error;
  } catch {
    await removeEvidencePaths(supabase, uploaded);
    fail("/devoluciones", "reception_failed");
  }

  revalidatePath("/devoluciones");
  revalidatePath("/devoluciones");
  ok("/devoluciones", "received");
}

export async function processInventoryAction(formData: FormData) {
  const profile = await requireRole(["admin", "inventario"]);
  const parsed = inventorySchema.safeParse({
    devolucionId: formData.get("devolucionId"),
    palletCodigo: formData.get("palletCodigo"),
    observaciones: formData.get("observaciones"),
    cantidadBueno: formData.get("cantidadBueno"),
    cantidadMalo: formData.get("cantidadMalo"),
  });

  if (!parsed.success) fail("/devoluciones", "validation");

  let evidence: File;
  try {
    evidence = assertEvidenceFile(formData.get("evidencia"), "Evidencia de inventario")!;
  } catch {
    fail("/devoluciones", "evidence_validation");
  }

  const supabase = await createClient();
  const uploaded: string[] = [];

  try {
    const evidencePath = await uploadEvidence(
      supabase,
      profile.id,
      parsed.data.devolucionId,
      "pallet",
      evidence,
    );
    uploaded.push(evidencePath);

    const { error } = await supabase.rpc("procesar_inventario_devolucion", {
      p_devolucion_id: parsed.data.devolucionId,
      p_pallet_codigo: parsed.data.palletCodigo,
      p_observaciones: parsed.data.observaciones || null,
      p_evidencia_path: evidencePath,
      p_cantidad_bueno: parsed.data.cantidadBueno ?? null,
      p_cantidad_malo: parsed.data.cantidadMalo ?? null,
    });

    if (error) throw error;
  } catch {
    await removeEvidencePaths(supabase, uploaded);
    fail("/devoluciones", "inventory_failed");
  }

  revalidatePath("/devoluciones");
  revalidatePath("/devoluciones");
  revalidatePath("/devoluciones");
  ok("/devoluciones", "processed");
}

export async function locateMaterialAction(formData: FormData) {
  const profile = await requireRole(["admin", "pesado", "almacen"]);
  const parsed = locationSchema.safeParse({
    materialId: formData.get("materialId"),
    ubicacion: formData.get("ubicacion"),
    observaciones: formData.get("observaciones"),
  });

  if (!parsed.success) fail("/devoluciones", "validation");

  let evidence: File | null;
  try {
    evidence = assertEvidenceFile(formData.get("evidencia"), "Evidencia de ubicacion", false);
  } catch {
    fail("/devoluciones", "evidence_validation");
  }

  const supabase = await createClient();
  const uploaded: string[] = [];

  try {
    const evidencePath = evidence
      ? await uploadEvidence(supabase, profile.id, parsed.data.materialId, "ubicacion", evidence)
      : null;
    if (evidencePath) uploaded.push(evidencePath);

    const { error } = await supabase.rpc("ubicar_material_devolucion", {
      p_material_id: parsed.data.materialId,
      p_ubicacion: parsed.data.ubicacion,
      p_observaciones: parsed.data.observaciones || null,
      p_evidencia_path: evidencePath,
    });

    if (error) throw error;
  } catch {
    await removeEvidencePaths(supabase, uploaded);
    fail("/devoluciones", "location_failed");
  }

  revalidatePath("/devoluciones");
  revalidatePath("/devoluciones");
  ok("/devoluciones", "located");
}

export async function disposeMaterialAction(formData: FormData) {
  const profile = await requireRole(["admin", "inventario"]);
  const parsed = dispositionSchema.safeParse({
    materialId: formData.get("materialId"),
    decisionFinal: formData.get("decisionFinal"),
    observaciones: formData.get("observaciones"),
  });

  if (!parsed.success) fail("/devoluciones", "validation");

  let evidence: File;
  try {
    evidence = assertEvidenceFile(formData.get("evidencia"), "Evidencia de disposicion")!;
  } catch {
    fail("/devoluciones", "evidence_validation");
  }

  const supabase = await createClient();
  const uploaded: string[] = [];

  try {
    const evidencePath = await uploadEvidence(
      supabase,
      profile.id,
      parsed.data.materialId,
      "disposicion",
      evidence,
    );
    uploaded.push(evidencePath);

    const { error } = await supabase.rpc("disponer_material_devolucion", {
      p_material_id: parsed.data.materialId,
      p_decision_final: parsed.data.decisionFinal,
      p_observaciones: parsed.data.observaciones,
      p_evidencia_path: evidencePath,
    });

    if (error) throw error;
  } catch {
    await removeEvidencePaths(supabase, uploaded);
    fail("/devoluciones", "disposition_failed");
  }

  revalidatePath("/devoluciones");
  revalidatePath("/devoluciones");
  ok("/devoluciones", "disposed");
}

export async function deleteDevolucionAction(formData: FormData) {
  await requireRole(["admin"]);
  const id = String(formData.get("devolucionId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) fail("/devoluciones", "invalid_id");

  const supabase = await createClient();

  const { data: evidenceRows } = await supabase
    .from("devolucion_evidencias")
    .select("url")
    .eq("devolucion_id", id);

  const { data, error } = await supabase.rpc("admin_eliminar_devolucion", {
    p_devolucion_id: id,
  });

  if (error || data !== true) fail("/devoluciones", "delete_failed");

  const paths = (evidenceRows ?? [])
    .map((row) => row.url)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  await removeEvidencePaths(supabase, paths);
  revalidatePath("/devoluciones");
  ok("/devoluciones", "deleted");
}