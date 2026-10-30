-- ==========================================================
-- DDEVOLUCIONES - HARDEN EVIDENCE PATHS AND TEXT INPUTS
-- Forward-only.
--
-- The RPCs validate roles and states, but an authenticated
-- session can call them directly with the publishable key,
-- skipping the server's Zod validation. This migration moves
-- the remaining input rules into the database:
--
-- 1. Text columns have upper length limits (the same or wider
--    than the application's schemas).
-- 2. An evidence row must point to an existing file in the
--    caller's own folder of the private bucket, in the module's
--    area (report-load evidence under reportes-carga/).
-- 3. get_operational_analytics_ep4 is no longer executable by
--    sessions: the application does not use it and it returned
--    report-load counts to roles without access to that module.
-- ==========================================================

begin;

-- ----------------------------------------------------------
-- 1. Text length limits.
-- ----------------------------------------------------------

alter table public.devoluciones
  add constraint devoluciones_text_lengths check (
    char_length(factura) <= 120
    and char_length(articulo) <= 160
    and char_length(coalesce(descripcion_material, '')) <= 2000
    and char_length(coalesce(transportista_nombre, '')) <= 160
    and char_length(coalesce(transportista_cedula, '')) <= 80
    and char_length(coalesce(placa_camion, '')) <= 40
    and char_length(coalesce(recepcion_observaciones, '')) <= 2000
  );

alter table public.devolucion_materiales
  add constraint devolucion_materiales_text_lengths check (
    char_length(coalesce(pallet_codigo, '')) <= 120
    and char_length(coalesce(ubicacion, '')) <= 300
    and char_length(coalesce(decision_final, '')) <= 500
    and char_length(coalesce(observaciones, '')) <= 2000
    and char_length(coalesce(descripcion, '')) <= 2000
  );

alter table public.reportes_carga
  add constraint reportes_carga_text_lengths check (
    char_length(coalesce(numero_documento, '')) <= 120
    and char_length(coalesce(factura, '')) <= 120
    and char_length(cliente) <= 300
    and char_length(coalesce(articulo, '')) <= 300
    and char_length(coalesce(descripcion_material, '')) <= 2000
    and char_length(coalesce(transportista, '')) <= 300
    and char_length(coalesce(ruta, '')) <= 120
    and char_length(coalesce(placa, '')) <= 100
    and char_length(coalesce(motivo_no_entrega, '')) <= 2000
    and char_length(coalesce(observaciones_retorno, '')) <= 2000
    and char_length(coalesce(conductor_envio, '')) <= 300
    and char_length(coalesce(placa_envio, '')) <= 100
    and char_length(coalesce(observaciones_redespacho, '')) <= 2000
  );

alter table public.devolucion_evidencias
  add constraint devolucion_evidencias_text_lengths check (
    char_length(url) <= 500
    and char_length(coalesce(descripcion, '')) <= 2000
  );

alter table public.reportes_carga_evidencias
  add constraint reportes_carga_evidencias_text_lengths check (
    char_length(url) <= 500
    and char_length(coalesce(descripcion, '')) <= 2000
  );

-- ----------------------------------------------------------
-- 2. Evidence must be the caller's own uploaded file.
-- ----------------------------------------------------------

create or replace function private.assert_own_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_folder text := split_part(new.url, '/', 1);
  v_area text := split_part(new.url, '/', 2);
  v_load_report boolean := tg_table_name = 'reportes_carga_evidencias';
begin
  -- Only sessions are checked; the service role (terminal scripts) has no auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if v_folder <> auth.uid()::text
     or (v_load_report and v_area <> 'reportes-carga')
     or (not v_load_report and v_area = 'reportes-carga')
     or not exists (
       select 1
       from storage.objects o
       where o.bucket_id = 'devoluciones'
         and o.name = new.url
     )
  then
    raise exception 'EVIDENCE_PATH_INVALID' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_own_evidence() from public, anon, authenticated;

drop trigger if exists devolucion_evidencias_own_file on public.devolucion_evidencias;
create trigger devolucion_evidencias_own_file
before insert on public.devolucion_evidencias
for each row execute function private.assert_own_evidence();

drop trigger if exists reportes_carga_evidencias_own_file on public.reportes_carga_evidencias;
create trigger reportes_carga_evidencias_own_file
before insert on public.reportes_carga_evidencias
for each row execute function private.assert_own_evidence();

-- ----------------------------------------------------------
-- 3. Unused analytics RPC.
-- ----------------------------------------------------------

revoke execute on function public.get_operational_analytics_ep4(text, text, text, text, text, text, text)
  from public, anon, authenticated;

commit;
