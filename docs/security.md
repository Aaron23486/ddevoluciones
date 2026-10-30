# Security

This document lists the controls in place, how each one is verified and the risks that remain. It does not claim the application is free of vulnerabilities.

## Controls

| Area                  | Control                                                                                                                                                           | Verified by                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Authentication        | Supabase Auth with email and password; no public sign-up; generic login errors                                                                                    | `security.test.ts` (sign-up closed), e2e `access.spec.mts`           |
| Account lifecycle     | New identities inactive with the least role; accounts managed from the terminal; last active admin protected; role/status changes recorded                        | `security.test.ts`, `demo.test.mts`                                  |
| Passwords             | 12+ characters with letters and digits; changed only through `terminal_set_password`, which closes sessions                                                       | `password.test.ts`                                                   |
| Sessions              | JWT validated on every request (`getClaims`); 12 h lifetime, 4 h idle timeout; `httpOnly`, `SameSite=Lax`, `Secure` cookie limited to 12 h                        | e2e `browser-security.spec.mts`, `csp.test.ts`                       |
| Authorization (pages) | `requireActiveProfile` / `requireRole` on every page and Server Action, from one route access map                                                                 | `permissions.test.ts`, e2e `access.spec.mts`                         |
| Authorization (data)  | RLS on every table; `SELECT` only for sessions; transitions through `SECURITY DEFINER` RPCs that check active profile, role, flow and state                       | `devoluciones.test.ts`, `reportes-carga.test.ts`, `security.test.ts` |
| Object-level access   | Pesado and Almacén read only their flow; transport and security roles cannot read returns; other roles cannot read load reports                                   | `devoluciones.test.ts`, `reportes-carga.test.ts`                     |
| Input validation      | Zod in every Server Action; database `CHECK` constraints on states, quantities and text lengths                                                                   | unit tests, `security.test.ts`                                       |
| Evidence              | Private bucket; own-folder uploads per module; referenced files cannot be deleted; evidence rows must point to the caller's existing file; file signature checked | `security.test.ts`, `unit-coverage.test.ts`                          |
| Integrity             | Row locks on transitions; one reception per return under concurrency; full history; delete snapshots                                                              | `devoluciones.test.ts`                                               |
| Browser               | Per-request nonce CSP with `'strict-dynamic'` and `connect-src 'self'`; HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP   | e2e `browser-security.spec.mts`                                      |
| Logging               | JSON security events for failed and denied logins and denied pages, with an email fingerprint instead of the address                                              | `events.test.ts`                                                     |
| Secrets               | Only public values in `.env.local`; the secret key stays in the Supabase CLI or the operator's shell                                                              | CI gitleaks over the full history                                    |
| Supply chain          | Lockfile, `npm audit` (high or critical fails CI), Dependabot, actions pinned by commit                                                                           | CI `supply-chain`                                                    |

## Residual risks

- **Styles allow `'unsafe-inline'`.** The UI and charts use inline `style` attributes; scripts remain nonce-only.
- **Login throttling** relies on Supabase Auth's per-IP rate limits; there is no application-level lockout.
- **Uploaded images are not re-encoded.** Their type and signature are checked and they are served only to authorized users of the private bucket, but their content is stored as received.
- **Hosted deployments** must reproduce the local Auth settings (sign-up disabled, session limits) in the Supabase dashboard; see [deployment.md](deployment.md).
- **Personal data** in returns (carrier name, ID and plate) is visible to every role that can read the case.

## Reporting

See [SECURITY.md](../SECURITY.md).
