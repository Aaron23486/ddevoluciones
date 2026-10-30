# 0005 — Private, owned evidence

- **Status:** Accepted
- **Date:** recorded 2026-10-29; extended with ownership checks the same day

## Context

Photos are the proof of each stage. They must not be public, must not be replaced or removed once a case refers to them, and a user must not attach someone else's file.

## Decision

Evidence lives in the private `devoluciones` bucket (5 MB, JPEG, PNG, WebP). Uploads go to `<user id>/…`, with load-report evidence under `<user id>/reportes-carga/…`; storage policies check the role for each area. Uploaders can delete only files no evidence row refers to, which lets a failed action clean up. A trigger requires every evidence row to point to an existing file in the caller's own folder and area, and the server checks the file signature before uploading.

## Consequences

- Evidence history cannot be altered by the users who created it.
- Cleanup of orphaned uploads is best effort when an action fails after uploading.
