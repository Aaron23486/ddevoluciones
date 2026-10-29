// Gestión de cuentas desde la terminal. La app no tiene registro público ni solicitudes de
// acceso: el primer administrador y los cambios de acceso se hacen aquí.
//
//   npm run users -- list
//   npm run users -- create [--role <rol>] [--name "Nombre"]   (devoluciones por defecto)
//   npm run users -- activate <correo>
//   npm run users -- deactivate <correo>
//   npm run users -- set-role <correo> --role <rol>
//   npm run users -- reset-password <correo>
//   npm run create-admin                                        (create --role admin)
//
// Roles: admin, devoluciones, pesado, inventario, almacen, transportes, seguridad.
// Funciona contra el Supabase local (npm run db:up); para un proyecto alojado, ver
// resolveSupabaseTarget. Al crear un admin, ADMIN_EMAIL y ADMIN_PASSWORD pueden venir del
// entorno. Las contraseñas nunca se imprimen ni se aceptan como argumento.
import { parseArgs } from "node:util";

import { z } from "zod";

import { newPasswordSchema } from "./lib/passwords.mts";
import { askNewPassword, askValid, closePrompt } from "./lib/prompt.mts";
import {
  adminClient,
  findAccountByEmail,
  resolveSupabaseTarget,
  ROLES,
  setPassword,
  setProfileAccess,
  type Role,
} from "./lib/supabase-local.mts";

const emailSchema = z.email("Correo inválido.").max(254).trim().toLowerCase();
const roleSchema = z.enum(ROLES, {
  error: `El rol debe ser uno de: ${ROLES.join(", ")}.`,
});
const nameSchema = z.string().trim().min(1).max(150);

const USAGE = `Uso:
  npm run users -- list
  npm run users -- create [--role <rol>] [--name "Nombre"]
  npm run users -- activate <correo>
  npm run users -- deactivate <correo>
  npm run users -- set-role <correo> --role <rol>
  npm run users -- reset-password <correo>
Roles: ${ROLES.join(", ")}`;

type Profile = {
  id: string;
  role: Role;
  is_active: boolean;
  full_name: string | null;
};

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      role: { type: "string" },
      name: { type: "string" },
    },
  });
  const [command, emailArg] = positionals;
  if (!command) throw new Error(USAGE);

  const admin = adminClient(resolveSupabaseTarget());

  const existingAccount = async () => {
    const email = emailSchema.parse(emailArg ?? "");
    const account = await findAccountByEmail(admin, email);
    if (!account)
      throw new Error(`No existe una cuenta con el correo ${email}.`);
    const { data, error } = await admin
      .from("profiles")
      .select("id, role, is_active, full_name")
      .eq("id", account.id)
      .maybeSingle();
    if (error || !data) throw new Error("La cuenta no tiene perfil de acceso.");
    return { account, profile: data as Profile };
  };

  switch (command) {
    case "list": {
      const { data, error } = await admin.auth.admin.listUsers({
        perPage: 500,
      });
      if (error)
        throw new Error(
          `No fue posible consultar las cuentas: ${error.message}`,
        );
      const { data: profiles, error: profileError } = await admin
        .from("profiles")
        .select("id, role, is_active, full_name");
      if (profileError) throw new Error("No fue posible leer los perfiles.");
      const byId = new Map((profiles as Profile[]).map((p) => [p.id, p]));
      const lines = data.users.map((user) => {
        const profile = byId.get(user.id);
        const access = profile
          ? `${profile.role} · ${profile.is_active ? "activo" : "INACTIVO"}`
          : "sin perfil";
        return `${user.email} · ${access}`;
      });
      console.log(lines.length ? lines.join("\n") : "No hay cuentas.");
      return;
    }

    case "create": {
      const role = roleSchema.parse(values.role ?? "devoluciones");
      const env: Partial<Record<string, string>> =
        role === "admin" ? process.env : {};
      const email = await askValid(emailSchema, "Correo: ", {
        envValue: env.ADMIN_EMAIL,
      });
      if (await findAccountByEmail(admin, email)) {
        throw new Error(`Ya existe una cuenta con el correo ${email}.`);
      }
      const fullName = nameSchema.parse(values.name ?? email.split("@")[0]);
      const password = await askNewPassword(
        newPasswordSchema,
        env.ADMIN_PASSWORD,
      );
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user) {
        throw new Error(`No fue posible crear la cuenta: ${error?.message}`);
      }
      // El trigger de Auth crea el perfil inactivo con el rol mínimo; aquí se habilita.
      await setProfileAccess(admin, data.user.id, { role, active: true });
      console.log(`Cuenta creada: ${email} · ${role} · activo`);
      return;
    }

    case "activate":
    case "deactivate": {
      const { account, profile } = await existingAccount();
      const active = command === "activate";
      const changed = await setProfileAccess(admin, account.id, {
        role: profile.role,
        active,
      });
      console.log(
        changed
          ? `${account.email}: ${active ? "activo" : "INACTIVO"}`
          : `${account.email}: sin cambios`,
      );
      return;
    }

    case "set-role": {
      const role = roleSchema.parse(values.role);
      const { account, profile } = await existingAccount();
      const changed = await setProfileAccess(admin, account.id, {
        role,
        active: profile.is_active,
      });
      console.log(
        changed ? `${account.email}: ${role}` : `${account.email}: sin cambios`,
      );
      return;
    }

    case "reset-password": {
      const { account } = await existingAccount();
      const password = await askNewPassword(newPasswordSchema);
      await setPassword(admin, account.id, password);
      console.log(`Contraseña actualizada para ${account.email}.`);
      return;
    }

    default:
      throw new Error(USAGE);
  }
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Datos inválidos.")
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(closePrompt);
