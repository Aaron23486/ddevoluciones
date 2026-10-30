# 0001 — The database is the authorization boundary

- **Status:** Accepted
- **Date:** recorded 2026-10-29; in place since the initial version

## Context

Seven roles share one process, and each role may act only on some stages and, for Pesado and Almacén, only on its own flow. A rule enforced only in a page or a Server Action could be bypassed by calling PostgREST directly with a valid session and the publishable key.

## Decision

I kept authorization and business rules in PostgreSQL. Every table has RLS; sessions get `SELECT` only, filtered by role and flow. Every transition is a `SECURITY DEFINER` function with a fixed `search_path` that checks the session, the active profile, the role, the flow and the current state, locks the row and records history. Constraints and triggers repeat the invariants (states, quantities, text lengths, evidence ownership, last admin) so they also hold for writes that skip the RPCs. The server still guards pages and actions for a clean experience.

## Consequences

- A modified client cannot skip a rule; the integration suite calls the API directly to prove it.
- Rules are tested against a real database (`tests/integration`), not mocks.
- Changing a rule means a new migration.
