# Deployment

The project is meant to be evaluated locally (see the README). This page describes an optional hosted deployment: a Supabase project and any Node.js host for Next.js.

## Supabase project

1. Create a project and link it: `npx supabase link --project-ref <ref>`.
2. Apply the migrations: `npx supabase db push`.
3. In **Authentication → Providers → Email**, keep email sign-in enabled and **disable sign-ups**.
4. In **Authentication → Sessions**, set a time-box of 12 hours and an inactivity timeout of 4 hours.
5. Keep **Secure password change** enabled.

## Accounts

Create the first administrator from a terminal with the project's values in the environment (never in a file):

```bash
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_PUBLISHABLE_KEY=<publishable key>
export SUPABASE_SECRET_KEY=<secret key>
npm run create-admin
```

`npm run users` works the same way for the rest of the accounts. `npm run demo:setup` refuses to run against a hosted project.

## Web application

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then `npm ci && npm run build && npm run start`. Serve it over HTTPS only: the session cookie is `Secure` in production and the CSP upgrades insecure requests.

## Checklist

- [ ] Migrations applied with `db push`, no manual SQL.
- [ ] Sign-ups disabled; session time-box and inactivity timeout set.
- [ ] First administrator created from the terminal; no demo accounts.
- [ ] Only the two public variables configured on the web host.
- [ ] HTTPS enforced; response headers include the CSP and HSTS.
