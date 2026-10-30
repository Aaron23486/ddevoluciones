import { mkdirSync, writeFileSync } from "node:fs";

import { chromium, type FullConfig } from "@playwright/test";

import { generateDemoPassword } from "../scripts/lib/passwords.mts";
import {
  adminClient,
  readLocalSupabase,
  setProfileAccess,
  type Role,
} from "../scripts/lib/supabase-local.mts";
import {
  AUTH_DIR,
  dataFile,
  SESSION_ROLES,
  signInThroughForm,
  storageFile,
  type AccountKey,
  type E2EData,
} from "./tests/support.mts";

// Prepara cada ejecución: una cuenta por rol usado en las pruebas (más una para el cierre de
// sesión) con contraseñas generadas, y la sesión guardada de cada rol para no iniciar sesión
// en cada prueba.
export default async function globalSetup(config: FullConfig): Promise<void> {
  const service = adminClient(readLocalSupabase());
  const run = `e2e${Date.now().toString(36)}`;

  const accounts = {} as E2EData["accounts"];
  for (const key of [...SESSION_ROLES, "signout"] as AccountKey[]) {
    const email = `${run}-${key}@example.test`;
    const password = generateDemoPassword();
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `E2E ${key}` },
    });
    if (error || !data.user) {
      throw new Error(`No se pudo crear ${email}: ${error?.message}`);
    }
    const role: Role = key === "signout" ? "devoluciones" : key;
    await setProfileAccess(service, data.user.id, { role, active: true });
    accounts[key] = { email, password, id: data.user.id };
  }

  mkdirSync(AUTH_DIR, { recursive: true });
  const data: E2EData = { run, accounts };
  writeFileSync(dataFile, JSON.stringify(data, null, 2));

  const { baseURL, channel } = config.projects[0].use;
  const browser = await chromium.launch({ channel });
  for (const role of SESSION_ROLES) {
    const page = await browser.newPage({ baseURL });
    await signInThroughForm(page, accounts[role]);
    await page.context().storageState({ path: storageFile(role) });
    await page.close();
  }
  await browser.close();
}
