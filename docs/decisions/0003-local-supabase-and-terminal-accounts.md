# 0003 — Local Supabase stack and terminal-managed accounts

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

The original setup required a hosted Supabase project, SQL pasted into the dashboard and a shared demo password, and one migration failed on an empty database. Accounts could also be requested through a public sign-up that had no review screen.

## Decision

The Supabase CLI runs the full stack in Docker (`db:up`) on dedicated ports and applies every migration to an empty database. `env:local` writes only public values. `demo:setup` creates one account per role with generated passwords shown once and records fictional returns and load reports through the same RPCs as the app; it refuses to run against a hosted project. `users` and `create-admin` manage accounts. Sign-up and the access-request flow were removed, and passwords change only through a service-role function.

## Consequences

- Anyone can evaluate the project without access to my Supabase project.
- Account administration needs terminal access to the project's secret key.
- There is no self-service password recovery.
