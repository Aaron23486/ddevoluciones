import { ShieldCheck, UserCheck, UserCog, UserX, Users } from "lucide-react";
import { USER_ROLES } from "@/constants/roles";
import { setUserActive, setUserRole } from "@/features/users/actions";
import { requireRole } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

type UsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type DemoProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function initials(fullName: string | null, email: string): string {
  const name = (fullName || email.split("@")[0] || "U").trim();
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function date(value: string): string {
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  await requireRole(["admin"]);

  const params = await searchParams;
  const search = one(params.search).trim().toLocaleLowerCase("es");
  const requestedRole = one(params.role).trim();
  const role = USER_ROLES.some((value) => value === requestedRole)
    ? requestedRole
    : "";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,is_active,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="demo-users-page">
        <section className="demo-users-error dv-glass" role="alert">
          <UserX size={28} />
          <div>
            <h1>No fue posible consultar usuarios</h1>
            <p>Comprueba la conexion a Supabase y las politicas de acceso.</p>
          </div>
        </section>
      </main>
    );
  }

  const profiles = (data ?? []) as DemoProfile[];
  const active = profiles.filter((profile) => profile.is_active).length;
  const admins = profiles.filter((profile) => profile.role === "admin").length;
  const inactive = profiles.length - active;
  const visible = profiles.filter((profile) => {
    const searchMatches =
      !search ||
      (profile.full_name ?? "").toLocaleLowerCase("es").includes(search) ||
      profile.email.toLocaleLowerCase("es").includes(search);
    return searchMatches && (!role || profile.role === role);
  });

  return (
    <main className="demo-users-page">
      <section className="demo-users-hero dv-glass">
        <div>
          <span className="demo-users-eyebrow">ADMINISTRACION DE ACCESO</span>
          <h1>Usuarios</h1>
          <p>
            Gestion de perfiles, permisos y accesos de prueba desde un solo
            lugar.
          </p>
        </div>
        <div className="demo-users-metrics" aria-label="Resumen de perfiles">
          <article>
            <span>Perfiles</span>
            <strong>{profiles.length}</strong>
          </article>
          <article>
            <span>Activos</span>
            <strong>{active}</strong>
          </article>
          <article>
            <span>Inactivos</span>
            <strong>{inactive}</strong>
          </article>
          <article>
            <span>Admins</span>
            <strong>{admins}</strong>
          </article>
        </div>
      </section>

      {one(params.error) ? (
        <div className="dx-message error" role="alert">
          No fue posible completar la operacion: {one(params.error)}
        </div>
      ) : null}

      <section className="demo-users-panel dv-glass">
        <header className="demo-users-panel-header">
          <div>
            <span className="demo-users-eyebrow">PERFILES</span>
            <h2>Equipo y permisos</h2>
            <p>
              Los usuarios nuevos se crean en Supabase Auth. Aqui administras su
              rol y activacion.
            </p>
          </div>
          <form
            action="/usuarios"
            method="get"
            className="demo-users-filter-form"
          >
            <label className="demo-users-search">
              <span className="sr-only">Buscar usuarios</span>
              <input
                name="search"
                defaultValue={one(params.search)}
                placeholder="Buscar usuario o correo"
              />
            </label>
            <label>
              <span className="sr-only">Filtrar por rol</span>
              <select name="role" defaultValue={role}>
                <option value="">Todos los roles</option>
                {USER_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Filtrar</button>
          </form>
        </header>

        <div className="demo-users-list">
          {visible.length === 0 ? (
            <div className="demo-users-empty">
              <Users size={22} />
              <strong>No se encontraron perfiles</strong>
              <p>
                Prueba con otro filtro o crea usuarios desde Supabase Auth
                siguiendo el README.
              </p>
            </div>
          ) : (
            visible.map((profile) => (
              <article
                key={profile.id}
                className={`demo-users-row${profile.is_active ? "" : " inactive"}`}
              >
                <div className="demo-users-identity">
                  <div className="demo-users-avatar" aria-hidden="true">
                    {initials(profile.full_name, profile.email)}
                  </div>
                  <div>
                    <strong>{profile.full_name || "Usuario de prueba"}</strong>
                    <span>{profile.email}</span>
                  </div>
                </div>

                <div className="demo-users-current-role">
                  <span>
                    <UserCog size={13} /> Rol actual
                  </span>
                  <strong>{profile.role}</strong>
                </div>

                <form action={setUserRole} className="demo-users-role-form">
                  <input type="hidden" name="userId" value={profile.id} />
                  <label className="sr-only" htmlFor={`role-${profile.id}`}>
                    Rol de {profile.email}
                  </label>
                  <select
                    id={`role-${profile.id}`}
                    name="role"
                    defaultValue={profile.role}
                  >
                    {USER_ROLES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <button type="submit">Cambiar rol</button>
                </form>

                <div className="demo-users-status">
                  <span className={profile.is_active ? "active" : "inactive"}>
                    {profile.is_active ? (
                      <UserCheck size={13} />
                    ) : (
                      <ShieldCheck size={13} />
                    )}
                    {profile.is_active ? "Activo" : "Inactivo"}
                  </span>
                  <small>Desde {date(profile.created_at)}</small>
                </div>

                <form action={setUserActive} className="demo-users-active-form">
                  <input type="hidden" name="userId" value={profile.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={profile.is_active ? "false" : "true"}
                  />
                  <button
                    className={profile.is_active ? "deactivate" : "activate"}
                    type="submit"
                  >
                    {profile.is_active ? "Desactivar" : "Activar"}
                  </button>
                </form>
              </article>
            ))
          )}
        </div>

        <footer className="demo-users-footnote">
          Mostrando {visible.length} de {profiles.length} perfiles. La creacion
          inicial se documenta en el README.
        </footer>
      </section>
    </main>
  );
}
