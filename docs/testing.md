# Testing

Three levels, all run in CI on every pull request and on `main`.

## Unit tests

`npm run test` / `npm run test:coverage` (Vitest, jsdom). They cover pure logic: the route access map, card actions per role, Zod schemas, evidence validation and file signatures, dashboard periods, metrics and snapshots, list helpers, notification presentation, CSP and cookie options, security events, and the demo-data and password helpers of the terminal scripts.

Coverage is measured on those modules (`vitest.config.mts`) with an 85% threshold for statements, branches, functions and lines; the build fails below it. UI components and data access are covered by the integration and end-to-end suites instead.

## Integration tests

`npm run test:integration` runs `tests/integration` against the local Supabase (`npm run db:up`). Each file creates its own accounts with generated passwords and deletes its rows, files and accounts at the end.

| File                     | Covers                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devoluciones.test.ts`   | The six complete flows (Pesado/Almacén × good/damaged/mixed) until the parent closes; mixed quantities; concurrent receptions; flow restrictions; RPC roles; delete audit; per-flow reads; blocked direct writes |
| `reportes-carga.test.ts` | Register, redispatch and void permissions; history; voided reports hidden; module visibility; notifications per role                                                                                             |
| `security.test.ts`       | Profile isolation, self-escalation, admin RPCs, inactive profiles, internal functions, closed sign-up, new-account defaults, last admin, access audit, storage rules, evidence ownership, text limits            |
| `password.test.ts`       | Sessions and the Auth admin API cannot change passwords; the terminal function does and closes sessions                                                                                                          |

## End-to-end and accessibility tests

`npm run test:e2e` builds the app and serves it on port 3100, then runs Playwright (Chromium) against the local Supabase. Global setup creates one account per tested role and stores their sessions; teardown removes the run's returns, reports, files and accounts.

| File                        | Covers                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `access.spec.mts`           | Redirects without a session, wrong credentials, sign in and out, menu per role, forbidden routes |
| `flows.spec.mts`            | Register a return with evidence, receive it, read its history; register a returned load          |
| `browser-security.spec.mts` | CSP nonce per response, injected inline handler blocked, cookie attributes, security headers     |
| `accessibility.spec.mts`    | axe WCAG 2.1 A/AA on every page and both creation dialogs                                        |

The first run needs `npx playwright install chromium`; `E2E_BROWSER_CHANNEL=msedge` or `chrome` uses an installed browser instead.

## Continuous integration

`.github/workflows/ci.yml` has three required jobs:

- `checks`: Prettier, ESLint, TypeScript, unit tests with coverage, production build.
- `supply-chain`: `npm audit --audit-level=high` and gitleaks over the full history.
- `integration`: local Supabase from the migrations, `demo:setup`, integration tests and end-to-end tests (report uploaded on failure).
