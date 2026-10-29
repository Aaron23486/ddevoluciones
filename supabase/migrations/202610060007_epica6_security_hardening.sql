begin;

-- ==========================================================
-- DDEVOLUCIONES - EPICA 6
-- SECURITY HARDENING
--
-- 1. Prevent direct execution of the automatic RLS event
--    trigger function by application roles. Hosted projects create
--    it through the dashboard's "auto-enable RLS" option; a fresh
--    database does not have it, so the revoke only runs when it exists.
-- 2. Protect evidence already referenced by business records.
-- ==========================================================

do $$
begin
    if to_regprocedure('public.rls_auto_enable()') is not null then
        revoke all
        on function public.rls_auto_enable()
        from public, anon, authenticated;
    end if;
end
$$;


-- ----------------------------------------------------------
-- Evidence integrity helper
-- ----------------------------------------------------------

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.evidence_path_is_referenced(
    p_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select
        exists (
            select 1
            from public.devolucion_evidencias e
            where e.url = p_path
        )
        or
        exists (
            select 1
            from public.reportes_carga_evidencias e
            where e.url = p_path
        );
$$;

revoke all
on function private.evidence_path_is_referenced(text)
from public, anon, authenticated;

grant execute
on function private.evidence_path_is_referenced(text)
to authenticated;


-- ----------------------------------------------------------
-- Storage DELETE
--
-- Admin:
--   may perform administrative deletion.
--
-- Other operational roles:
--   may only remove their own unreferenced uploads. This
--   preserves cleanup of failed uploads while preventing
--   deletion of evidence already committed to a workflow.
-- ----------------------------------------------------------

drop policy if exists ddevoluciones_evidence_delete
on storage.objects;

create policy ddevoluciones_evidence_delete
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'devoluciones'
    and public.current_user_is_active()
    and (
        public.current_user_role() = 'admin'

        or

        (
            (storage.foldername(name))[1] = auth.uid()::text

            and not private.evidence_path_is_referenced(name)

            and (
                (
                    coalesce(
                        (storage.foldername(name))[2],
                        ''
                    ) <> 'reportes-carga'

                    and public.current_user_role() in (
                        'devoluciones',
                        'pesado',
                        'inventario',
                        'almacen'
                    )
                )

                or

                (
                    (storage.foldername(name))[2] = 'reportes-carga'

                    and public.current_user_role() in (
                        'inventario',
                        'transportes',
                        'seguridad'
                    )
                )
            )
        )
    )
);

commit;