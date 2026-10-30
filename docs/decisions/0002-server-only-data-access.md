# 0002 — Only the server talks to Supabase

- **Status:** Accepted
- **Date:** recorded 2026-10-29

## Context

Pages read data in Server Components and forms post to Server Actions. A browser Supabase client existed but nothing used it. If the browser talked to Supabase, the session cookie would have to be readable by JavaScript and the CSP would have to allow the Supabase origin.

## Decision

I removed the browser client. All reads and writes go through the Next.js server with the user's session. The session cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production and limited to 12 hours, and `connect-src` is `'self'`. Notifications are fetched from `/api/notifications`.

## Consequences

- A script injected into the page cannot read the session.
- There is no live (Realtime) update; lists refresh after each action or navigation.
