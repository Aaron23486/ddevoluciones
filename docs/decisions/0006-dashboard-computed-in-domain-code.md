# 0006 — Dashboard metrics computed in domain code

- **Status:** Accepted
- **Date:** recorded 2026-10-29

## Context

The executive dashboard compares a period with the previous one and precomputes a filtered view for every selectable value (state, flow, material, item, carrier, plate, route, customer, physical state, reason). The computation was mixed with the queries in one 1,000-line repository.

## Decision

The repository reads the rows of both periods with the user's session (so RLS applies) and the pure functions in `src/domain/reports` compute periods, KPIs, distributions, trends, aging, attention points and selections. They are covered by unit tests.

## Consequences

- The metrics can be tested without a database and changed without touching SQL.
- The dashboard reads every row of the two periods; for much larger volumes, aggregates would move to SQL.
