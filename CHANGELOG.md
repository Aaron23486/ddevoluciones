# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Local Supabase stack with `db:up`, `db:down`, `db:reset`, `db:status` and `env:local`; every migration applies to an empty database.
- `demo:setup` with one account per role, generated passwords and fictional returns and load reports in every stage; `users` and `create-admin` for account management from the terminal.
- Database guard that keeps at least one active administrator, and an audit trail of role and status changes (`profile_access_events`).
- Integration tests against the local database, unit coverage threshold of 85%, and Playwright end-to-end tests with axe accessibility checks.
- CI with `checks`, `supply-chain` and `integration` jobs, and Dependabot.
- English documentation: requirements, architecture, database, security, testing, deployment and decision records; MIT license and security policy.

### Changed

- One route access map drives page guards, navigation and redirects.
- The largest pages, the dashboard, its analytics and the stylesheet are split into cohesive modules without visual changes.
- Unused dependencies, duplicated SQL bundles and dead components were removed.

### Removed

- Public sign-up and the access-request flow; accounts are created from the terminal.
- The shared demo password and the manual verification scripts, replaced by `demo:setup` and the test suites.

### Fixed

- The proxy now runs (it was outside `src/`), so sessions are refreshed on every request.
- Migration `202610060007` no longer fails on a fresh database.
- File inputs and selects in the creation dialogs have accessible names.

### Security

- Patched `next` (critical) and `zod` (high) advisories.
- Per-request nonce CSP, HSTS and hardening headers; `httpOnly` session cookie and 12-hour sessions with a 4-hour idle timeout; security events for login failures and denied access.
- Passwords change only from the terminal, which also closes the account's sessions.
- Evidence rows must reference the caller's own uploaded file; uploads are checked by file signature; text inputs are bounded in the database; an unused analytics function that exposed load-report counts is no longer callable.

## [0.1.0] - 2026-10-07

### Added

- Returns with Pesado and Almacén flows, good, damaged and mixed material, reception, inventory, location, disposal and history.
- Load reports with redispatch and voiding.
- Private photo evidence, notifications, executive dashboard and user administration.
- Seven roles enforced with row-level security and `SECURITY DEFINER` functions.
