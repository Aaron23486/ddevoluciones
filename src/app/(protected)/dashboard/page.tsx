import Link from "next/link";
import { redirect } from "next/navigation";
import { OperationalDashboard } from "@/components/dashboard/operational-dashboard";
import { canAccessRoute, getDefaultRoute } from "@/constants/permissions";
import { requireActiveProfile } from "@/lib/auth/require-user";
import { one } from "@/lib/list-page";
import { getExecutiveDashboardData } from "@/repositories/dashboard-analytics";
import {
  listDispositionQueue,
  listInventoryQueue,
  listLocationQueue,
  listReceptionQueue,
} from "@/repositories/devoluciones";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const profile = await requireActiveProfile();

  if (!canAccessRoute(profile.role, "/dashboard")) {
    redirect(getDefaultRoute(profile.role));
  }

  if (profile.role === "admin" || profile.role === "devoluciones") {
    const params = await searchParams;
    const daysValue = Number(one(params.days));
    const days = [7, 30, 90].includes(daysValue) ? daysValue : 30;

    const data = await getExecutiveDashboardData({
      days,
      from: one(params.from) || undefined,
      to: one(params.to) || undefined,
      includeCarga: profile.role === "admin",
    });

    return <OperationalDashboard key={data.period.key} data={data} />;
  }

  const [reception, inventory, location, disposition] = await Promise.all([
    profile.role === "pesado" ? listReceptionQueue() : Promise.resolve([]),
    profile.role === "inventario" ? listInventoryQueue() : Promise.resolve([]),
    profile.role === "pesado" || profile.role === "almacen"
      ? listLocationQueue()
      : Promise.resolve([]),
    profile.role === "inventario"
      ? listDispositionQueue()
      : Promise.resolve([]),
  ]);

  return (
    <main className="dx-module-page">
      <section className="dx-hero dv-glass">
        <div>
          <span className="dx-kicker">Resumen de trabajo</span>
          <h1>Dashboard</h1>
          <p>Acceso rapido a las tareas visibles para el rol {profile.role}.</p>
        </div>

        <Link href="/devoluciones" className="dx-hero-link">
          Ir a Devoluciones
        </Link>
      </section>

      <section className="dx-kpi-grid">
        <article className="dx-kpi blue">
          <span>Recepcion visible</span>
          <strong>{reception.length}</strong>
        </article>

        <article className="dx-kpi purple">
          <span>Inventario visible</span>
          <strong>{inventory.length}</strong>
        </article>

        <article className="dx-kpi orange">
          <span>Ubicacion visible</span>
          <strong>{location.length}</strong>
        </article>

        <article className="dx-kpi green">
          <span>Disposicion visible</span>
          <strong>{disposition.length}</strong>
        </article>
      </section>

      <section className="dx-dashboard-panel dv-glass">
        <h2>Operacion consolidada</h2>
        <p>
          Las acciones correspondientes al rol se encuentran dentro de cada caso
          en Devoluciones.
        </p>

        <Link href="/devoluciones" className="dx-detail-link">
          Abrir centro operativo
        </Link>
      </section>
    </main>
  );
}
