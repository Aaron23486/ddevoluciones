# Architecture

## Principles

- **The database decides.** Roles, flows, state transitions and evidence ownership are enforced by PostgreSQL; the UI only shows what each role can do.
- **The server is the only Supabase client.** The browser renders pages and posts forms; it never calls Supabase.
- **Small, single-purpose modules.** Pages compose components; pure rules live in `src/domain` and `src/lib` with unit tests; data access lives in repositories.
- **Reproducible by anyone.** A local Supabase stack, one command per step and generated demo accounts.

## Request paths

```text
Browser ──► src/proxy.ts ──► Server Component ──► repository ──► Supabase (user session) ──► PostgreSQL (RLS)
   │          (session refresh,
   │           CSP nonce)
   └─ form ─► Server Action ──► Zod ──► requireRole ──► evidence upload ──► RPC (SECURITY DEFINER)
```

- **Reads.** Server Components call `requireActiveProfile` or `requireRole`, then repositories in `src/repositories` query tables with the user's session; RLS filters rows by role and flow.
- **Writes.** Server Actions in `src/features` validate input with Zod, check the role again, upload evidence to the user's folder (`src/services/evidence-storage.ts`) and call an RPC. If the RPC fails, the uploaded files are removed. Results come back as `?success=` or `?error=` codes shown by a toast.
- **Session.** `src/proxy.ts` validates the JWT with `getClaims()` on every request and refreshes the cookie, which is `httpOnly`, `SameSite=Lax`, `Secure` in production and limited to 12 hours.

## Code structure

| Path                            | Responsibility                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/app`                       | Routes and layouts; `app/styles` holds the stylesheet as ordered layers                                         |
| `src/components/devoluciones`   | Stage forms, case card, case detail, filters                                                                    |
| `src/components/reportes-carga` | Load-report forms, card, detail, filters                                                                        |
| `src/components/dashboard`      | Executive dashboard and its charts                                                                              |
| `src/components/app`, `ui`      | Navigation, pagination, modals, confirmation, evidence picker, toasts                                           |
| `src/features`                  | Server Actions per module                                                                                       |
| `src/domain`                    | Dashboard periods, metrics and snapshots; parent-state derivation                                               |
| `src/repositories`              | Supabase reads and paginated queries                                                                            |
| `src/schemas`                   | Zod schemas for every form                                                                                      |
| `src/lib`                       | Auth guards, Supabase server clients, cookie options, CSP, security events, list helpers, card actions per role |
| `src/constants`                 | Roles and the route access map (`ROUTE_ROLES`)                                                                  |
| `scripts`                       | `env:local`, `users`, `demo:setup` and their shared helpers                                                     |

## Access matrix

| Role           | Dashboard   | Returns (read) | Returns (act)            | Load reports (read/act)         | Users |
| -------------- | ----------- | -------------- | ------------------------ | ------------------------------- | ----- |
| `admin`        | Executive   | All            | Every stage, delete      | All; register, redispatch, void | Yes   |
| `devoluciones` | Executive   | All            | Register                 | —                               | —     |
| `pesado`       | Work queues | Pesado flow    | Receive, locate (Pesado) | —                               | —     |
| `inventario`   | Work queues | All            | Inventory, dispose       | All; register, redispatch       | —     |
| `almacen`      | Work queues | Almacén flow   | Locate (Almacén)         | —                               | —     |
| `transportes`  | —           | —              | —                        | All; register                   | —     |
| `seguridad`    | —           | —              | —                        | All; register                   | —     |

`ROUTE_ROLES` drives page guards, navigation and redirects; RLS and RPCs enforce the same matrix in the database.

## Decisions

| ID  | Decision                                                                                     | Record                                                             |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| D-1 | Authorization and business rules live in PostgreSQL                                          | [ADR 0001](decisions/0001-database-as-authorization-boundary.md)   |
| D-2 | Only the server talks to Supabase; the session cookie is `httpOnly`                          | [ADR 0002](decisions/0002-server-only-data-access.md)              |
| D-3 | Local Supabase stack and terminal-managed accounts, no sign-up                               | [ADR 0003](decisions/0003-local-supabase-and-terminal-accounts.md) |
| D-4 | Per-request nonce CSP                                                                        | [ADR 0004](decisions/0004-per-request-nonce-csp.md)                |
| D-5 | Private, owned evidence that cannot be removed once referenced                               | [ADR 0005](decisions/0005-private-evidence-storage.md)             |
| D-6 | The dashboard reads rows and computes metrics in pure, tested code instead of SQL aggregates | [ADR 0006](decisions/0006-dashboard-computed-in-domain-code.md)    |
