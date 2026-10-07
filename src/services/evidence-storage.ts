import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function assertEvidenceFile(
  value: FormDataEntryValue | null,
  label: string,
  required = true,
): File | null {
  if (!(value instanceof File) || value.size === 0) {
    if (required) throw new Error(`${label}: archivo requerido`);
    return null;
  }

  if (!MIME_TO_EXTENSION[value.type]) {
    throw new Error(`${label}: formato no permitido`);
  }

  if (value.size > MAX_FILE_SIZE) {
    throw new Error(`${label}: maximo 5 MB`);
  }

  return value;
}

export async function uploadEvidence(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
  stage: string,
  file: File,
): Promise<string> {
  const extension = MIME_TO_EXTENSION[file.type];
  const path = `${userId}/${groupId}/${stage}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("devoluciones")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`No se pudo subir evidencia: ${error.message}`);
  return path;
}

export async function removeEvidencePaths(
  supabase: SupabaseClient,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from("devoluciones").remove([...paths]);
}