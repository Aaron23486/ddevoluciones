import { NotificationsCenter } from "@/components/notifications/notifications-center";
import { OperationToast } from "@/components/feedback/operation-toast";
import type { ReactNode } from "react";
import { TopNavigation } from "@/components/app/top-navigation";
import { getFinalNavigation } from "@/constants/final-navigation";
import { signOut } from "@/features/auth/actions";
import { requireActiveProfile } from "@/lib/auth/require-user";
import { getMyNotifications } from "@/repositories/notifications";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const profile = await requireActiveProfile();
  const notifications = await getMyNotifications(12);
  const links = getFinalNavigation(profile.role);

  return (
    <div className="dv-app dx-app">
      <header className="dx-topbar-wrap">
        <div className="dx-topbar dv-glass">
          <div className="dx-brand">
            <span className="dx-brand-mark" aria-hidden="true">
              DV
            </span>
            <div>
              <strong>Devoluciones</strong>
              <small>Sistema de trazabilidad</small>
            </div>
          </div>

          <TopNavigation links={links} />

          <div className="dx-top-actions">
            <NotificationsCenter initialNotifications={notifications} />

            <details className="dx-profile-menu">
              <summary>
                <span>
                  {(profile.full_name ?? profile.email)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div>
                  <strong>{profile.full_name ?? "Usuario"}</strong>
                  <small>{profile.role}</small>
                </div>
              </summary>

              <div className="dx-profile-panel dv-glass">
                <strong>{profile.full_name ?? profile.email}</strong>
                <small>{profile.email}</small>
                <span>Rol: {profile.role}</span>
                <form action={signOut}>
                  <button type="submit">Cerrar sesion</button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>

      <OperationToast />

      <main className="dx-page-shell">{children}</main>
    </div>
  );
}
