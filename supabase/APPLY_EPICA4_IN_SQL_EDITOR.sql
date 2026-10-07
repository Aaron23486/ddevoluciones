begin;

-- ==========================================================
-- DDEVOLUCIONES / EPICA 4
-- Reporte de carga + notificaciones + analitica
--
-- Contrato original conservado:
-- - Reporte de carga: admin/inventario/transportes/seguridad pueden ver/crear.
-- - Redespacho activo observado: admin/inventario.
-- - Anulacion: solo admin, is_active=false.
-- - Alta queda directamente pendiente_redespacho, pero historial conserva:
--     null -> recibido_muelle -> pendiente_redespacho
-- - Buzon unico: target_role OR target_user_id.
-- - Admin NO ve mensajes de todos los roles automaticamente.
-- ==========================================================

-- Original field validation observed in the active UI.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reportes_carga_estado_fisico_check'
      and conrelid = 'public.reportes_carga'::regclass
  ) then
    alter table public.reportes_carga
      add constraint reportes_carga_estado_fisico_check
      check (
        estado_fisico_carga is null
        or estado_fisico_carga in ('Buen estado','Mal estado')
      );
  end if;
end
$$;

create index if not exists idx_reportes_carga_numero_documento_trgm
  on public.reportes_carga using gin (numero_documento gin_trgm_ops);
create index if not exists idx_reportes_carga_factura_trgm
  on public.reportes_carga using gin (factura gin_trgm_ops);
create index if not exists idx_reportes_carga_cliente_trgm
  on public.reportes_carga using gin (cliente gin_trgm_ops);
create index if not exists idx_reportes_carga_articulo_trgm
  on public.reportes_carga using gin (articulo gin_trgm_ops);
create index if not exists idx_reportes_carga_transportista_trgm
  on public.reportes_carga using gin (transportista gin_trgm_ops);
create index if not exists idx_reportes_carga_ruta_trgm
  on public.reportes_carga using gin (ruta gin_trgm_ops);
create index if not exists idx_reportes_carga_placa_trgm
  on public.reportes_carga using gin (placa gin_trgm_ops);

-- Direct writes remain denied. Browser users get only RLS-filtered SELECT.
revoke insert, update, delete on table public.reportes_carga from authenticated;
revoke insert, update, delete on table public.reportes_carga_evidencias from authenticated;
revoke insert, update, delete on table public.reportes_carga_historial from authenticated;

grant select on table public.reportes_carga to authenticated;
grant select on table public.reportes_carga_evidencias to authenticated;
grant select on table public.reportes_carga_historial to authenticated;

drop policy if exists reportes_carga_select_ep4 on public.reportes_carga;
create policy reportes_carga_select_ep4
on public.reportes_carga
for select
to authenticated
using (
  public.current_user_is_active()
  and public.current_user_role() in (
    'admin','inventario','transportes','seguridad'
  )
  and is_active = true
);

drop policy if exists reportes_carga_evidencias_select_ep4 on public.reportes_carga_evidencias;
create policy reportes_carga_evidencias_select_ep4
on public.reportes_carga_evidencias
for select
to authenticated
using (
  public.current_user_is_active()
  and public.current_user_role() in (
    'admin','inventario','transportes','seguridad'
  )
  and exists (
    select 1
    from public.reportes_carga r
    where r.id = reportes_carga_evidencias.reporte_carga_id
      and r.is_active = true
  )
);

drop policy if exists reportes_carga_historial_select_ep4 on public.reportes_carga_historial;
create policy reportes_carga_historial_select_ep4
on public.reportes_carga_historial
for select
to authenticated
using (
  public.current_user_is_active()
  and public.current_user_role() in (
    'admin','inventario','transportes','seguridad'
  )
  and exists (
    select 1
    from public.reportes_carga r
    where r.id = reportes_carga_historial.reporte_carga_id
      and r.is_active = true
  )
);

create or replace function public.ep4_assert_role(p_allowed public.app_role[])
returns public.app_role
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception 'AUTH_NOT_ACTIVE';
  end if;

  v_role := public.current_user_role()::public.app_role;

  if v_role is null or not (v_role = any(p_allowed)) then
    raise exception 'FORBIDDEN_ROLE';
  end if;

  return v_role;
end;
$$;

create or replace function public.ep4_notify_report_roles(
  p_title text,
  p_message text,
  p_event_type text,
  p_reporte_carga_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role;
begin
  foreach v_role in array array[
    'admin'::public.app_role,
    'inventario'::public.app_role,
    'transportes'::public.app_role,
    'seguridad'::public.app_role
  ]
  loop
    insert into public.internal_notifications (
      title,
      message,
      event_type,
      target_role,
      target_user_id,
      devolucion_id,
      reporte_carga_id,
      created_by,
      is_system
    )
    values (
      p_title,
      p_message,
      p_event_type,
      v_role,
      null,
      null,
      p_reporte_carga_id,
      auth.uid(),
      false
    );
  end loop;
end;
$$;

create or replace function public.crear_reporte_carga_ep4(
  p_numero_documento text,
  p_factura text,
  p_cliente text,
  p_articulo text,
  p_descripcion_material text,
  p_cantidad integer,
  p_transportista text,
  p_ruta text,
  p_placa text,
  p_motivo_no_entrega text,
  p_estado_fisico_carga text,
  p_observaciones_retorno text,
  p_evidencia_path text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_user_name text;
begin
  perform public.ep4_assert_role(
    array['admin','inventario','transportes','seguridad']::public.app_role[]
  );

  if nullif(trim(p_cliente), '') is null then raise exception 'CLIENTE_REQUIRED'; end if;
  if nullif(trim(p_articulo), '') is null then raise exception 'ARTICULO_REQUIRED'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'CANTIDAD_INVALID'; end if;
  if nullif(trim(p_motivo_no_entrega), '') is null then raise exception 'MOTIVO_REQUIRED'; end if;
  if p_estado_fisico_carga not in ('Buen estado','Mal estado') then
    raise exception 'ESTADO_FISICO_INVALID';
  end if;
  if nullif(trim(p_evidencia_path), '') is null then
    raise exception 'EVIDENCIA_RECEPCION_REQUIRED';
  end if;

  select coalesce(nullif(trim(full_name), ''), email)
  into v_user_name
  from public.profiles
  where id = auth.uid();

  insert into public.reportes_carga (
    numero_documento,
    factura,
    cliente,
    articulo,
    descripcion_material,
    cantidad,
    transportista,
    ruta,
    placa,
    motivo_no_entrega,
    estado_fisico_carga,
    observaciones_retorno,
    estado,
    recibido_por,
    recibido_at,
    is_active
  )
  values (
    nullif(upper(trim(p_numero_documento)), ''),
    nullif(upper(trim(p_factura)), ''),
    trim(p_cliente),
    upper(trim(p_articulo)),
    nullif(trim(p_descripcion_material), ''),
    p_cantidad,
    nullif(trim(p_transportista), ''),
    nullif(trim(p_ruta), ''),
    nullif(upper(trim(p_placa)), ''),
    trim(p_motivo_no_entrega),
    p_estado_fisico_carga,
    nullif(trim(p_observaciones_retorno), ''),
    'pendiente_redespacho',
    auth.uid(),
    now(),
    true
  )
  returning id into v_id;

  insert into public.reportes_carga_evidencias (
    reporte_carga_id,
    tipo,
    url,
    descripcion,
    creado_por
  )
  values (
    v_id,
    'recepcion_carga',
    trim(p_evidencia_path),
    'Evidencia de recepcion / factura.',
    auth.uid()
  );

  -- Preserve the real historical peculiarity from the original system.
  insert into public.reportes_carga_historial (
    reporte_carga_id,
    accion,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    usuario_nombre,
    observacion
  )
  values
    (
      v_id,
      'retorno_registrado',
      null,
      'recibido_muelle',
      auth.uid(),
      v_user_name,
      nullif(trim(p_observaciones_retorno), '')
    ),
    (
      v_id,
      'estado_actualizado',
      'recibido_muelle',
      'pendiente_redespacho',
      auth.uid(),
      v_user_name,
      'La carga quedo resguardada en muelle pendiente de redespacho.'
    );

  -- The active original flow uses ONE initial semantic notification:
  -- pending shipment. Four rows are required because target_role is singular.
  perform public.ep4_notify_report_roles(
    'Carga pendiente de envio',
    'Se registro el retorno de una carga no entregada y quedo pendiente de envio.',
    'reporte_carga_pendiente_envio',
    v_id
  );

  return v_id;
end;
$$;

create or replace function public.redespachar_reporte_carga_ep4(
  p_reporte_carga_id uuid,
  p_conductor text,
  p_placa_salida text,
  p_observaciones text,
  p_evidencia_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reporte public.reportes_carga%rowtype;
  v_user_name text;
begin
  -- Active original permission implementation:
  -- Admin and Inventario can register redispatch.
  perform public.ep4_assert_role(
    array['admin','inventario']::public.app_role[]
  );

  if nullif(trim(p_conductor), '') is null then raise exception 'CONDUCTOR_REQUIRED'; end if;
  if nullif(trim(p_placa_salida), '') is null then raise exception 'PLACA_SALIDA_REQUIRED'; end if;
  if nullif(trim(p_observaciones), '') is null then raise exception 'OBSERVACIONES_REQUIRED'; end if;
  if nullif(trim(p_evidencia_path), '') is null then raise exception 'EVIDENCIA_REDESPACHO_REQUIRED'; end if;

  select *
  into v_reporte
  from public.reportes_carga
  where id = p_reporte_carga_id
    and is_active = true
  for update;

  if not found then raise exception 'REPORTE_NOT_FOUND'; end if;
  if v_reporte.estado = 'redespachado' then raise exception 'ALREADY_REDISPATCHED'; end if;

  select coalesce(nullif(trim(full_name), ''), email)
  into v_user_name
  from public.profiles
  where id = auth.uid();

  update public.reportes_carga
  set estado = 'redespachado',
      redespachado_por = auth.uid(),
      redespachado_at = now(),
      conductor_envio = trim(p_conductor),
      placa_envio = upper(trim(p_placa_salida)),
      observaciones_redespacho = trim(p_observaciones)
  where id = p_reporte_carga_id;

  insert into public.reportes_carga_evidencias (
    reporte_carga_id,
    tipo,
    url,
    descripcion,
    creado_por
  )
  values (
    p_reporte_carga_id,
    'redespacho',
    trim(p_evidencia_path),
    'Evidencia de salida / redespacho.',
    auth.uid()
  );

  insert into public.reportes_carga_historial (
    reporte_carga_id,
    accion,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    usuario_nombre,
    observacion
  )
  values (
    p_reporte_carga_id,
    'redespacho_registrado',
    v_reporte.estado,
    'redespachado',
    auth.uid(),
    v_user_name,
    trim(p_observaciones)
  );

  perform public.ep4_notify_report_roles(
    'Carga enviada',
    'La carga fue enviada nuevamente a ruta.',
    'reporte_carga_enviado',
    p_reporte_carga_id
  );
end;
$$;

create or replace function public.anular_reporte_carga_ep4(
  p_reporte_carga_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reporte public.reportes_carga%rowtype;
  v_user_name text;
begin
  perform public.ep4_assert_role(array['admin']::public.app_role[]);

  select *
  into v_reporte
  from public.reportes_carga
  where id = p_reporte_carga_id
    and is_active = true
  for update;

  if not found then
    return false;
  end if;

  select coalesce(nullif(trim(full_name), ''), email)
  into v_user_name
  from public.profiles
  where id = auth.uid();

  update public.reportes_carga
  set is_active = false
  where id = p_reporte_carga_id;

  insert into public.reportes_carga_historial (
    reporte_carga_id,
    accion,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    usuario_nombre,
    observacion
  )
  values (
    p_reporte_carga_id,
    'reporte_anulado',
    v_reporte.estado,
    v_reporte.estado,
    auth.uid(),
    v_user_name,
    'Reporte de carga eliminado logicamente por Admin.'
  );

  return true;
end;
$$;

create or replace function public.buscar_reportes_carga_ep4(
  p_search text,
  p_estado text,
  p_desde date,
  p_hasta date,
  p_limit integer,
  p_offset integer
)
returns setof public.reportes_carga
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.ep4_assert_role(
    array['admin','inventario','transportes','seguridad']::public.app_role[]
  );

  return query
  select r.*
  from public.reportes_carga r
  where r.is_active = true
    and (
      nullif(trim(p_search), '') is null
      or r.factura ilike '%' || trim(p_search) || '%'
      or r.numero_documento ilike '%' || trim(p_search) || '%'
      or r.cliente ilike '%' || trim(p_search) || '%'
      or r.articulo ilike '%' || trim(p_search) || '%'
      or r.transportista ilike '%' || trim(p_search) || '%'
      or r.ruta ilike '%' || trim(p_search) || '%'
      or r.placa ilike '%' || trim(p_search) || '%'
    )
    and (nullif(trim(p_estado), '') is null or r.estado = trim(p_estado))
    and (p_desde is null or coalesce(r.recibido_at, r.created_at) >= p_desde::timestamptz)
    and (p_hasta is null or coalesce(r.recibido_at, r.created_at) < (p_hasta + 1)::timestamptz)
  order by coalesce(r.recibido_at, r.created_at) desc
  limit least(greatest(coalesce(p_limit, 21), 1), 101)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.reportes_carga_metricas_ep4(
  p_search text,
  p_estado text,
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.ep4_assert_role(
    array['admin','inventario','transportes','seguridad']::public.app_role[]
  );

  select jsonb_build_object(
    'total', count(*),
    'recibido_muelle', count(*) filter (where estado = 'recibido_muelle'),
    'pendiente_redespacho', count(*) filter (where estado = 'pendiente_redespacho'),
    'redespachado', count(*) filter (where estado = 'redespachado'),
    'tasa_reenvio',
      case when count(*) = 0 then 0
           else round(
             (count(*) filter (where estado = 'redespachado'))::numeric * 100 / count(*),
             2
           )
      end
  )
  into v_result
  from public.reportes_carga r
  where r.is_active = true
    and (
      nullif(trim(p_search), '') is null
      or r.factura ilike '%' || trim(p_search) || '%'
      or r.numero_documento ilike '%' || trim(p_search) || '%'
      or r.cliente ilike '%' || trim(p_search) || '%'
      or r.articulo ilike '%' || trim(p_search) || '%'
      or r.transportista ilike '%' || trim(p_search) || '%'
      or r.ruta ilike '%' || trim(p_search) || '%'
      or r.placa ilike '%' || trim(p_search) || '%'
    )
    and (nullif(trim(p_estado), '') is null or r.estado = trim(p_estado))
    and (p_desde is null or coalesce(r.recibido_at, r.created_at) >= p_desde::timestamptz)
    and (p_hasta is null or coalesce(r.recibido_at, r.created_at) < (p_hasta + 1)::timestamptz);

  return v_result;
end;
$$;

-- ==========================================================
-- NOTIFICATIONS
-- ==========================================================

create or replace function public.get_my_notifications_ep4(
  p_limit integer
)
returns table (
  id uuid,
  title text,
  message text,
  event_type text,
  target_role public.app_role,
  target_user_id uuid,
  devolucion_id uuid,
  reporte_carga_id uuid,
  created_at timestamptz,
  is_read boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    n.id,
    n.title,
    n.message,
    n.event_type,
    n.target_role,
    n.target_user_id,
    n.devolucion_id,
    n.reporte_carga_id,
    n.created_at,
    (r.id is not null) as is_read
  from public.internal_notifications n
  left join public.internal_notification_reads r
    on r.notification_id = n.id
   and r.user_id = auth.uid()
  where public.current_user_is_active()
    and (
      n.target_user_id = auth.uid()
      or n.target_role::text = public.current_user_role()
    )
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create or replace function public.mark_internal_notification_read_ep4(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception 'AUTH_NOT_ACTIVE';
  end if;

  if not exists (
    select 1
    from public.internal_notifications n
    where n.id = p_notification_id
      and (
        n.target_user_id = auth.uid()
        or n.target_role::text = public.current_user_role()
      )
  ) then
    raise exception 'NOTIFICATION_NOT_VISIBLE';
  end if;

  insert into public.internal_notification_reads (
    notification_id,
    user_id
  )
  values (
    p_notification_id,
    auth.uid()
  )
  on conflict (notification_id, user_id) do nothing;
end;
$$;

create or replace function public.mark_all_internal_notifications_read_ep4()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception 'AUTH_NOT_ACTIVE';
  end if;

  insert into public.internal_notification_reads (
    notification_id,
    user_id
  )
  select n.id, auth.uid()
  from public.internal_notifications n
  where (
      n.target_user_id = auth.uid()
      or n.target_role::text = public.current_user_role()
    )
  on conflict (notification_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- User events by user/role without changing the demo login flow.
create or replace function public.ep4_user_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (
    (tg_op = 'INSERT' and new.status = 'pending')
    or (
      tg_op = 'UPDATE'
      and new.status = 'pending'
      and old.status is distinct from new.status
    )
  ) then
    insert into public.internal_notifications (
      title, message, event_type, target_role, target_user_id,
      created_by, is_system
    )
    values (
      'Usuario pendiente',
      'Existe una solicitud de acceso pendiente de revision.',
      'usuario_pendiente',
      'admin',
      null,
      auth.uid(),
      false
    );
  elsif (
    tg_op = 'UPDATE'
    and new.status = 'approved'
    and old.status is distinct from new.status
  ) then
    insert into public.internal_notifications (
      title, message, event_type, target_role, target_user_id,
      created_by, is_system
    )
    values (
      'Acceso aprobado',
      'Tu solicitud de acceso fue aprobada.',
      'usuario_aprobado',
      null,
      new.user_id,
      auth.uid(),
      false
    );
  elsif (
    tg_op = 'UPDATE'
    and new.status = 'rejected'
    and old.status is distinct from new.status
  ) then
    insert into public.internal_notifications (
      title, message, event_type, target_role, target_user_id,
      created_by, is_system
    )
    values (
      'Acceso rechazado',
      'Tu solicitud de acceso fue rechazada.',
      'usuario_rechazado',
      null,
      new.user_id,
      auth.uid(),
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists user_access_request_notifications_ep4
on public.user_access_requests;

create trigger user_access_request_notifications_ep4
after insert or update of status
on public.user_access_requests
for each row
execute function public.ep4_user_request_notifications();

-- Epica 3 already notifies Devoluciones on closure.
-- Add the second confirmed recipient: Admin, once per closure.
create or replace function public.ep4_notify_admin_on_devolucion_close()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.accion = 'estado_padre_recalculado'
     and new.estado_nuevo = 'cerrada'
     and not exists (
       select 1
       from public.internal_notifications n
       where n.devolucion_id = new.devolucion_id
         and n.event_type = 'devolucion_cerrada'
         and n.target_role = 'admin'
     )
  then
    insert into public.internal_notifications (
      title,
      message,
      event_type,
      target_role,
      target_user_id,
      devolucion_id,
      created_by,
      is_system
    )
    values (
      'Devolucion cerrada',
      'La devolucion quedo cerrada completamente. Todos los materiales fueron ubicados o dispuestos segun correspondia.',
      'devolucion_cerrada',
      'admin',
      null,
      new.devolucion_id,
      new.usuario_id,
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists devolucion_close_admin_notification_ep4
on public.devolucion_historial;

create trigger devolucion_close_admin_notification_ep4
after insert
on public.devolucion_historial
for each row
execute function public.ep4_notify_admin_on_devolucion_close();

-- ==========================================================
-- COMBINED ANALYTICS
-- ==========================================================

create or replace function public.get_operational_analytics_ep4(
  p_bucket text,
  p_modulo text,
  p_estado_devolucion text,
  p_flujo text,
  p_material text,
  p_mes text,
  p_estado_reporte text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.ep4_assert_role(
    array['admin','devoluciones']::public.app_role[]
  );

  with base as (
    select
      d.id,
      'devoluciones'::text as modulo,
      d.factura::text as referencia,
      d.estado::text as estado,
      d.flujo_inicial::text as flujo,
      d.estado_material::text as material,
      d.created_at as fecha,
      case
        when d.estado = 'cerrada' then 'resuelto'
        when d.estado in ('pendiente_ubicar','pendiente_disposicion') then 'pendiente_accion'
        when d.estado = 'recibida_bodega' then 'en_proceso'
        else 'entrada'
      end as bucket,
      exists (
        select 1
        from public.devolucion_evidencias e
        where e.devolucion_id = d.id
      ) as has_evidence
    from public.devoluciones d

    union all

    select
      r.id,
      'reporte_carga'::text as modulo,
      coalesce(r.numero_documento, r.factura, r.cliente)::text as referencia,
      r.estado::text as estado,
      null::text as flujo,
      null::text as material,
      coalesce(r.recibido_at, r.created_at) as fecha,
      case
        when r.estado = 'redespachado' then 'resuelto'
        else 'pendiente_accion'
      end as bucket,
      exists (
        select 1
        from public.reportes_carga_evidencias e
        where e.reporte_carga_id = r.id
      ) as has_evidence
    from public.reportes_carga r
    where r.is_active = true
  ),
  filtered as (
    select *
    from base b
    where (nullif(trim(p_bucket), '') is null or b.bucket = trim(p_bucket))
      and (nullif(trim(p_modulo), '') is null or b.modulo = trim(p_modulo))
      and (
        nullif(trim(p_estado_devolucion), '') is null
        or b.modulo <> 'devoluciones'
        or b.estado = trim(p_estado_devolucion)
      )
      and (
        nullif(trim(p_flujo), '') is null
        or b.modulo <> 'devoluciones'
        or b.flujo = trim(p_flujo)
      )
      and (
        nullif(trim(p_material), '') is null
        or b.modulo <> 'devoluciones'
        or b.material = trim(p_material)
      )
      and (
        nullif(trim(p_estado_reporte), '') is null
        or b.modulo <> 'reporte_carga'
        or b.estado = trim(p_estado_reporte)
      )
      and (
        nullif(trim(p_mes), '') is null
        or to_char(b.fecha, 'YYYY-MM') = trim(p_mes)
      )
  )
  select jsonb_build_object(
    'total', count(*),
    'entrada', count(*) filter (where bucket = 'entrada'),
    'en_proceso', count(*) filter (where bucket = 'en_proceso'),
    'pendiente_accion', count(*) filter (where bucket = 'pendiente_accion'),
    'resuelto', count(*) filter (where bucket = 'resuelto'),
    'casos_seguimiento',
      count(*) filter (where bucket in ('en_proceso','pendiente_accion')),
    'efectividad',
      case when count(*) = 0 then 0
           else round(
             (count(*) filter (where bucket = 'resuelto'))::numeric * 100 / count(*),
             2
           )
      end,
    'trazabilidad',
      case when count(*) = 0 then 0
           else round(
             (count(*) filter (where has_evidence))::numeric * 100 / count(*),
             2
           )
      end,
    'por_modulo',
      coalesce((
        select jsonb_agg(
          jsonb_build_object('key', x.modulo, 'count', x.cantidad)
          order by x.modulo
        )
        from (
          select modulo, count(*) as cantidad
          from filtered
          group by modulo
        ) x
      ), '[]'::jsonb),
    'por_flujo',
      coalesce((
        select jsonb_agg(
          jsonb_build_object('key', x.flujo, 'count', x.cantidad)
          order by x.flujo
        )
        from (
          select flujo, count(*) as cantidad
          from filtered
          where modulo = 'devoluciones' and flujo is not null
          group by flujo
        ) x
      ), '[]'::jsonb),
    'por_material',
      coalesce((
        select jsonb_agg(
          jsonb_build_object('key', x.material, 'count', x.cantidad)
          order by x.material
        )
        from (
          select material, count(*) as cantidad
          from filtered
          where modulo = 'devoluciones' and material is not null
          group by material
        ) x
      ), '[]'::jsonb),
    'estados_devoluciones',
      coalesce((
        select jsonb_agg(
          jsonb_build_object('key', x.estado, 'count', x.cantidad)
          order by x.estado
        )
        from (
          select estado, count(*) as cantidad
          from filtered
          where modulo = 'devoluciones'
          group by estado
        ) x
      ), '[]'::jsonb),
    'estados_reporte_carga',
      coalesce((
        select jsonb_agg(
          jsonb_build_object('key', x.estado, 'count', x.cantidad)
          order by x.estado
        )
        from (
          select estado, count(*) as cantidad
          from filtered
          where modulo = 'reporte_carga'
            and estado <> 'recibido_muelle'
          group by estado
        ) x
      ), '[]'::jsonb),
    'tendencia',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'mes', x.mes,
            'modulo', x.modulo,
            'count', x.cantidad
          )
          order by x.mes, x.modulo
        )
        from (
          select
            to_char(date_trunc('month', fecha), 'YYYY-MM') as mes,
            modulo,
            count(*) as cantidad
          from filtered
          group by date_trunc('month', fecha), modulo
        ) x
      ), '[]'::jsonb),
    'casos',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', x.id,
            'modulo', x.modulo,
            'referencia', x.referencia,
            'estado', x.estado,
            'bucket', x.bucket,
            'flujo', x.flujo,
            'material', x.material,
            'fecha', x.fecha,
            'has_evidence', x.has_evidence
          )
          order by x.fecha desc
        )
        from (
          select *
          from filtered
          order by fecha desc
          limit 25
        ) x
      ), '[]'::jsonb)
  )
  into v_result
  from filtered;

  return v_result;
end;
$$;

-- ==========================================================
-- PRIVATE STORAGE POLICIES
-- Keep Reporte de carga evidence isolated from the devolucion path.
-- Paths:
--   <uid>/reportes-carga/...
-- ==========================================================

drop policy if exists ddevoluciones_evidence_read on storage.objects;
create policy ddevoluciones_evidence_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'devoluciones'
  and public.current_user_is_active()
  and (
    (
      coalesce((storage.foldername(name))[2], '') <> 'reportes-carga'
      and public.current_user_role() in (
        'admin','devoluciones','pesado','inventario','almacen'
      )
    )
    or
    (
      (storage.foldername(name))[2] = 'reportes-carga'
      and public.current_user_role() in (
        'admin','inventario','transportes','seguridad'
      )
    )
  )
);

drop policy if exists ddevoluciones_evidence_insert on storage.objects;
create policy ddevoluciones_evidence_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'devoluciones'
  and public.current_user_is_active()
  and (storage.foldername(name))[1] = auth.uid()::text
  and (
    (
      coalesce((storage.foldername(name))[2], '') <> 'reportes-carga'
      and public.current_user_role() in (
        'admin','devoluciones','pesado','inventario','almacen'
      )
    )
    or
    (
      (storage.foldername(name))[2] = 'reportes-carga'
      and public.current_user_role() in (
        'admin','inventario','transportes','seguridad'
      )
    )
  )
);

drop policy if exists ddevoluciones_evidence_delete on storage.objects;
create policy ddevoluciones_evidence_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'devoluciones'
  and public.current_user_is_active()
  and (
    public.current_user_role() = 'admin'
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and (
        (
          coalesce((storage.foldername(name))[2], '') <> 'reportes-carga'
          and public.current_user_role() in (
            'devoluciones','pesado','inventario','almacen'
          )
        )
        or
        (
          (storage.foldername(name))[2] = 'reportes-carga'
          and public.current_user_role() in (
            'inventario','transportes','seguridad'
          )
        )
      )
    )
  )
);

-- ==========================================================
-- FUNCTION PRIVILEGES
-- ==========================================================

revoke all on function public.ep4_assert_role(public.app_role[]) from public, anon, authenticated;
revoke all on function public.ep4_notify_report_roles(text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.ep4_user_request_notifications() from public, anon, authenticated;
revoke all on function public.ep4_notify_admin_on_devolucion_close() from public, anon, authenticated;

revoke all on function public.crear_reporte_carga_ep4(text,text,text,text,text,integer,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.redespachar_reporte_carga_ep4(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.anular_reporte_carga_ep4(uuid) from public, anon, authenticated;
revoke all on function public.buscar_reportes_carga_ep4(text,text,date,date,integer,integer) from public, anon, authenticated;
revoke all on function public.reportes_carga_metricas_ep4(text,text,date,date) from public, anon, authenticated;
revoke all on function public.get_my_notifications_ep4(integer) from public, anon, authenticated;
revoke all on function public.mark_internal_notification_read_ep4(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_internal_notifications_read_ep4() from public, anon, authenticated;
revoke all on function public.get_operational_analytics_ep4(text,text,text,text,text,text,text) from public, anon, authenticated;

grant execute on function public.crear_reporte_carga_ep4(text,text,text,text,text,integer,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.redespachar_reporte_carga_ep4(uuid,text,text,text,text) to authenticated;
grant execute on function public.anular_reporte_carga_ep4(uuid) to authenticated;
grant execute on function public.buscar_reportes_carga_ep4(text,text,date,date,integer,integer) to authenticated;
grant execute on function public.reportes_carga_metricas_ep4(text,text,date,date) to authenticated;
grant execute on function public.get_my_notifications_ep4(integer) to authenticated;
grant execute on function public.mark_internal_notification_read_ep4(uuid) to authenticated;
grant execute on function public.mark_all_internal_notifications_read_ep4() to authenticated;
grant execute on function public.get_operational_analytics_ep4(text,text,text,text,text,text,text) to authenticated;

commit;