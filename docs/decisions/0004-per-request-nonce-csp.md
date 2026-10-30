# 0004 — Per-request nonce Content Security Policy

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

The application sent no security headers, and its proxy lived at the repository root while the app lives under `src/`, so Next.js never ran it.

## Decision

`src/proxy.ts` builds a CSP for every request with a fresh nonce: `script-src 'self' 'nonce-…' 'strict-dynamic'` without `'unsafe-inline'`, `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`. The root layout calls `connection()` so every page, including 404, is rendered per request and receives the nonce. `next.config.ts` adds HSTS (production builds), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and COOP.

## Consequences

- Injected inline scripts and event handlers do not run; an end-to-end test proves it.
- Pages are not statically cached.
- Styles still allow `'unsafe-inline'` because the UI and charts use `style` attributes.
