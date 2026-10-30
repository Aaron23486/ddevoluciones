import { existsSync } from "node:fs";

import {
  adminClient,
  readLocalSupabase,
} from "../scripts/lib/supabase-local.mts";
import { dataFile, e2eData } from "./tests/support.mts";

// Borra lo que creó la ejecución: devoluciones, reportes, evidencias y cuentas de prueba.
export default async function globalTeardown(): Promise<void> {
  if (!existsSync(dataFile)) return;
  const { run, accounts } = e2eData();
  const service = adminClient(readLocalSupabase());

  await service.from("devoluciones").delete().like("factura", `E2E-${run}%`);
  await service
    .from("reportes_carga")
    .delete()
    .like("numero_documento", `E2E-${run}%`);

  // Las evidencias viven en carpetas por usuario, con subcarpetas por operación.
  const removeFolder = async (prefix: string): Promise<void> => {
    const { data } = await service.storage
      .from("devoluciones")
      .list(prefix, { limit: 1000 });
    const files: string[] = [];
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else await removeFolder(path);
    }
    if (files.length) await service.storage.from("devoluciones").remove(files);
  };

  for (const account of Object.values(accounts)) {
    await removeFolder(account.id);
    await service.auth.admin.deleteUser(account.id);
  }
}
