import {
  ArrowRight,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { signIn } from "@/features/auth/actions";

const errorMessages: Record<string, string> = {
  credentials: "Correo o contrasena incorrectos.",
  inactive: "La cuenta existe, pero no esta activa.",
};

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <main className="dx-login-page">
      <div className="dx-login-orb one" />
      <div className="dx-login-orb two" />

      <section className="dx-login-shell">
        <div className="dx-login-brand">
          <span className="dx-login-kicker">
            <Sparkles size={14} />
            Sistema de devoluciones
          </span>

          <div className="dx-login-logo">DV</div>

          <h1>Acceso interno</h1>
          <p>
            Trazabilidad operativa, evidencias, estados y control de procesos en
            una experiencia segura y centralizada.
          </p>

          <div className="dx-login-trust">
            <span>
              <ShieldCheck size={16} />
              Acceso protegido por rol
            </span>
            <span>
              <Users size={16} />
              Siete roles operativos
            </span>
          </div>
        </div>

        <div className="dx-login-stack">
          <section className="dx-login-card">
            <header>
              <span>Bienvenido</span>
              <h2>Iniciar sesion</h2>
              <p>
                Inicia sesion con una cuenta creada en tu proyecto Supabase.
              </p>
            </header>

            {error ? (
              <div className="dx-login-error">
                {errorMessages[error] ??
                  "No fue posible completar la operacion."}
              </div>
            ) : null}

            <form action={signIn} className="dx-login-form">
              <label>
                <span>Correo</span>
                <div className="dx-login-field">
                  <Mail size={16} />
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="usuario@ejemplo.com"
                  />
                </div>
              </label>

              <label>
                <span>Contrasena</span>
                <div className="dx-login-field">
                  <Lock size={16} />
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="Tu contrasena"
                  />
                </div>
              </label>

              <button className="dx-login-submit">
                <span>Ingresar</span>
                <ArrowRight size={17} />
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
