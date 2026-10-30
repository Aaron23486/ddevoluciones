# Database

PostgreSQL 17 on Supabase. The schema is created only by `supabase/migrations`, applied in order by `npm run db:up` or `npm run db:reset`; migrations are forward-only.

## Tables

| Table                         | Contents                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `profiles`                    | One row per Auth user: email, name, role (`app_role`), active flag                           |
| `profile_access_events`       | Every role or status change: who, when, before and after                                     |
| `devoluciones`                | Return: invoice, item, quantity, classification, flow, carrier, plate, state, photos, author |
| `devolucion_materiales`       | Material lines of a return (good or damaged) with pallet, location or final decision         |
| `devolucion_evidencias`       | Evidence files of a return by stage and type                                                 |
| `devolucion_historial`        | Transitions of a return and its lines, with author and details                               |
| `devolucion_delete_audit`     | Full JSON snapshot of deleted returns                                                        |
| `reportes_carga`              | Returned load: document, customer, item, reason, physical state, redispatch data, state      |
| `reportes_carga_evidencias`   | Evidence of a load report                                                                    |
| `reportes_carga_historial`    | Transitions of a load report                                                                 |
| `internal_notifications`      | Notifications for a role or a user, linked to a return or report                             |
| `internal_notification_reads` | Read marks per user                                                                          |

Every table has RLS enabled. `anon` has no privileges; `authenticated` has `SELECT` only, filtered by policies.

## State machines

```text
Return (Pesado):   pendiente_entrega ─receive─► recibida_bodega ─inventory─► pendiente_ubicar / pendiente_disposicion ─► cerrada
Return (Almacén):  pendiente_proceso ─inventory─► pendiente_ubicar / pendiente_disposicion ─► cerrada
Material line:     recibido ─► pendiente_ubicar ─locate─► cerrada   (good)
                   recibido ─► pendiente_disposicion ─dispose─► cerrada   (damaged)
Load report:       recibido_muelle / pendiente_redespacho ─redispatch─► redespachado      (void: is_active = false)
```

The parent state is recalculated from its lines after each line transition (`ep3_recalculate_parent`).

## Functions callable by sessions

| Function                                                                                                      | Who                                       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `crear_devolucion`                                                                                            | admin, devoluciones                       |
| `confirmar_recepcion_devolucion`                                                                              | admin, pesado (Pesado flow)               |
| `procesar_inventario_devolucion`                                                                              | admin, inventario                         |
| `ubicar_material_devolucion`                                                                                  | admin, pesado / almacen (own flow)        |
| `disponer_material_devolucion`                                                                                | admin, inventario                         |
| `admin_eliminar_devolucion`, `anular_reporte_carga_ep4`, `admin_set_user_role`, `admin_set_user_active`       | admin                                     |
| `crear_reporte_carga_ep4`                                                                                     | admin, inventario, transportes, seguridad |
| `redespachar_reporte_carga_ep4`                                                                               | admin, inventario                         |
| `buscar_devoluciones`, `buscar_reportes_carga_ep4`, `reportes_carga_metricas_ep4`                             | read helpers, filtered by role            |
| `get_my_notifications_ep4`, `mark_internal_notification_read_ep4`, `mark_all_internal_notifications_read_ep4` | any active user                           |

All are `SECURITY DEFINER` with a fixed `search_path`; they check `auth.uid()`, the active profile and the role (`ep3_assert_role`, `ep4_assert_role`), lock the row they change (`FOR UPDATE`) and record history. Internal helpers have `EXECUTE` revoked from `public`, `anon` and `authenticated`.

`terminal_set_password(user_id, password)` is executable only by the service role (terminal scripts).

## Invariants

- `CHECK` constraints on states, classifications, flows, positive quantities and the length of every free-text column.
- `keep_an_active_admin` trigger: the last active `admin` cannot be demoted, deactivated or deleted (serialized with an advisory lock).
- `record_profile_access_event` trigger: role and status changes are written to `profile_access_events`.
- `assert_own_evidence` trigger on both evidence tables: the path must be an existing object in the caller's folder and module area.
- `guard_password_changes` trigger on `auth.users`: password hashes change only inside `terminal_set_password`.
- `handle_new_user_profile` trigger: new Auth users get an inactive `devoluciones` profile.

## Storage

Bucket `devoluciones`: private, 5 MB, `image/jpeg`, `image/png`, `image/webp`. Paths are `<user id>/<group>/<stage>-<uuid>.<ext>`; load-report evidence uses `<user id>/reportes-carga/...`.

| Policy | Rule                                                                    |
| ------ | ----------------------------------------------------------------------- |
| Insert | Active user, own folder, role allowed for the module area               |
| Read   | Admin, or the role's module area                                        |
| Delete | Admin, or the uploader for files not yet referenced by any evidence row |

## Migrations

| File                                                      | Purpose                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `202610050001_access_foundation.sql`                      | Roles, profiles, admin RPCs, RLS on profiles                        |
| `202610050002_confirmed_domain_schema.sql`                | Returns, lines, evidence, notifications, load reports, bucket       |
| `202610050003_demo_login.sql`                             | New users never get a role from client metadata                     |
| `202610050004_demo_seed_service_role_grants.sql`          | Service-role grants for terminal scripts                            |
| `202610050005_epica3_operational_core.sql`                | Return RPCs, history, delete audit, read policies, storage policies |
| `202610050006_epica4_reports_notifications_analytics.sql` | Load-report RPCs, notifications, metrics                            |
| `202610060007_epica6_security_hardening.sql`              | Referenced evidence cannot be deleted by its uploader               |
| `202610070001_admin_hitos_operativos.sql`                 | One admin notification per new return                               |
| `202610290001_terminal_accounts_and_access_audit.sql`     | No access requests, last-admin guard, access events                 |
| `202610290002_password_changes_only_from_terminal.sql`    | Terminal-only password changes                                      |
| `202610290003_harden_evidence_and_text_inputs.sql`        | Text limits, own-evidence trigger, unused analytics RPC revoked     |
