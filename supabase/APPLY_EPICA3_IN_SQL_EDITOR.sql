begin;

create extension if not exists pg_trgm;

alter table public.devolucion_materiales
  add column if not exists decision_final text;

create table if not exists public.devolucion_historial (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones(id) on delete cascade,
  material_id uuid references public.devolucion_materiales(id) on delete cascade,
  accion text not null,
  estado_anterior text,
  estado_nuevo text,
  detalles jsonb not null default '{}'::jsonb,
  usuario_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_devolucion_historial_devolucion
  on public.devolucion_historial(devolucion_id, created_at desc);
create index if not exists idx_devolucion_historial_material
  on public.devolucion_historial(material_id, created_at desc);

create table if not exists public.devolucion_delete_audit (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null,
  factura text,
  snapshot jsonb not null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now()
);

create index if not exists idx_devolucion_delete_audit_devolucion
  on public.devolucion_delete_audit(devolucion_id);

create index if not exists idx_devoluciones_created_at
  on public.devoluciones(created_at desc);
create index if not exists idx_devoluciones_factura_trgm
  on public.devoluciones using gin (factura gin_trgm_ops);
create index if not exists idx_devoluciones_articulo_trgm
  on public.devoluciones using gin (articulo gin_trgm_ops);

alter table public.devolucion_historial enable row level security;
alter table public.devolucion_delete_audit enable row level security;

-- Read permissions are row-filtered. All business writes go through RPCs.
revoke insert, update, delete on table public.devoluciones from authenticated;
revoke insert, update, delete on table public.devolucion_materiales from authenticated;
revoke insert, update, delete on table public.devolucion_evidencias from authenticated;
revoke insert, update, delete on table public.devolucion_historial from authenticated;
revoke insert, update, delete on table public.devolucion_delete_audit from authenticated;

grant select on table public.devoluciones to authenticated;
grant select on table public.devolucion_materiales to authenticated;
grant select on table public.devolucion_evidencias to authenticated;
grant select on table public.devolucion_historial to authenticated;
grant select on table public.devolucion_delete_audit to authenticated;

drop policy if exists devoluciones_select_operational on public.devoluciones;
create policy devoluciones_select_operational
on public.devoluciones
for select
to authenticated
using (
  public.current_user_is_active()
  and (
    public.current_user_role() in ('admin','devoluciones','inventario')
    or (public.current_user_role() = 'pesado' and flujo_inicial = 'pesado')
    or (public.current_user_role() = 'almacen' and flujo_inicial = 'almacen')
  )
);

drop policy if exists materiales_select_operational on public.devolucion_materiales;
create policy materiales_select_operational
on public.devolucion_materiales
for select
to authenticated
using (
  exists (
    select 1
    from public.devoluciones d
    where d.id = devolucion_materiales.devolucion_id
  )
);

drop policy if exists evidencias_select_operational on public.devolucion_evidencias;
create policy evidencias_select_operational
on public.devolucion_evidencias
for select
to authenticated
using (
  exists (
    select 1
    from public.devoluciones d
    where d.id = devolucion_evidencias.devolucion_id
  )
);

drop policy if exists historial_select_operational on public.devolucion_historial;
create policy historial_select_operational
on public.devolucion_historial
for select
to authenticated
using (
  exists (
    select 1
    from public.devoluciones d
    where d.id = devolucion_historial.devolucion_id
  )
);

drop policy if exists delete_audit_admin_select on public.devolucion_delete_audit;
create policy delete_audit_admin_select
on public.devolucion_delete_audit
for select
to authenticated
using (
  public.current_user_is_active()
  and public.current_user_role() = 'admin'
);

create or replace function public.ep3_assert_role(p_allowed public.app_role[])
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

  v_role := public.current_user_role();

  if v_role is null or not (v_role = any(p_allowed)) then
    raise exception 'FORBIDDEN_ROLE';
  end if;

  return v_role;
end;
$$;

create or replace function public.ep3_record_event(
  p_devolucion_id uuid,
  p_material_id uuid,
  p_accion text,
  p_estado_anterior text,
  p_estado_nuevo text,
  p_detalles jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.devolucion_historial (
    devolucion_id,
    material_id,
    accion,
    estado_anterior,
    estado_nuevo,
    detalles,
    usuario_id
  )
  values (
    p_devolucion_id,
    p_material_id,
    p_accion,
    p_estado_anterior,
    p_estado_nuevo,
    coalesce(p_detalles, '{}'::jsonb),
    auth.uid()
  );

  update public.devoluciones
  set audit = coalesce(audit, '[]'::jsonb) ||
    jsonb_build_array(
      jsonb_build_object(
        'accion', p_accion,
        'material_id', p_material_id,
        'estado_anterior', p_estado_anterior,
        'estado_nuevo', p_estado_nuevo,
        'detalles', coalesce(p_detalles, '{}'::jsonb),
        'usuario_id', auth.uid(),
        'at', now()
      )
    )
  where id = p_devolucion_id;
end;
$$;

create or replace function public.ep3_notify(
  p_title text,
  p_message text,
  p_event_type text,
  p_target_role public.app_role,
  p_devolucion_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.internal_notifications (
    title,
    message,
    event_type,
    target_role,
    devolucion_id,
    created_by,
    is_system
  )
  values (
    p_title,
    p_message,
    p_event_type,
    p_target_role,
    p_devolucion_id,
    auth.uid(),
    true
  );
end;
$$;

create or replace function public.ep3_recalculate_parent(p_devolucion_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous text;
  v_new text;
  v_count integer;
  v_all_closed boolean;
  v_any_received boolean;
  v_any_good_pending boolean;
  v_any_bad_pending boolean;
begin
  select estado
  into v_previous
  from public.devoluciones
  where id = p_devolucion_id
  for update;

  if not found then
    raise exception 'DEVOLUCION_NOT_FOUND';
  end if;

  select
    count(*)::integer,
    bool_and(estado = 'cerrada'),
    bool_or(estado = 'recibido'),
    bool_or(tipo_material = 'bueno' and estado = 'pendiente_ubicar'),
    bool_or(tipo_material = 'malo' and estado = 'pendiente_disposicion')
  into
    v_count,
    v_all_closed,
    v_any_received,
    v_any_good_pending,
    v_any_bad_pending
  from public.devolucion_materiales
  where devolucion_id = p_devolucion_id;

  if v_count = 0 then
    return v_previous;
  end if;

  if v_all_closed then
    v_new := 'cerrada';
  elsif v_any_received then
    v_new := 'recibida_bodega';
  elsif v_any_good_pending then
    v_new := 'pendiente_ubicar';
  elsif v_any_bad_pending then
    v_new := 'pendiente_disposicion';
  else
    v_new := v_previous;
  end if;

  if v_new is distinct from v_previous then
    update public.devoluciones
    set estado = v_new,
        cerrado_por = case when v_new = 'cerrada' then auth.uid() else cerrado_por end,
        cerrado_at = case when v_new = 'cerrada' then now() else cerrado_at end
    where id = p_devolucion_id;

    perform public.ep3_record_event(
      p_devolucion_id,
      null,
      'estado_padre_recalculado',
      v_previous,
      v_new,
      '{}'::jsonb
    );

    if v_new = 'cerrada' then
      perform public.ep3_notify(
        'Devolucion cerrada',
        'Todos los materiales de la devolucion fueron cerrados.',
        'devolucion_cerrada',
        'devoluciones',
        p_devolucion_id
      );
    end if;
  end if;

  return v_new;
end;
$$;

create or replace function public.crear_devolucion(
  p_factura text,
  p_articulo text,
  p_cantidad integer,
  p_clasificacion text,
  p_descripcion text,
  p_flujo text,
  p_transportista_nombre text,
  p_transportista_cedula text,
  p_placa_camion text,
  p_factura_path text,
  p_material_path text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_estado text;
  v_role public.app_role;
  v_clasificacion text := lower(trim(p_clasificacion));
  v_flujo text := lower(trim(p_flujo));
begin
  v_role := public.ep3_assert_role(array['admin','devoluciones']::public.app_role[]);

  if nullif(trim(p_factura), '') is null then raise exception 'FACTURA_REQUIRED'; end if;
  if nullif(trim(p_articulo), '') is null then raise exception 'ARTICULO_REQUIRED'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'CANTIDAD_INVALID'; end if;
  if v_clasificacion not in ('bueno','malo','mixto') then raise exception 'CLASIFICACION_INVALID'; end if;
  if nullif(trim(p_descripcion), '') is null then raise exception 'DESCRIPCION_REQUIRED'; end if;
  if v_flujo not in ('pesado','almacen') then raise exception 'FLUJO_INVALID'; end if;
  if nullif(trim(p_transportista_nombre), '') is null then raise exception 'TRANSPORTISTA_REQUIRED'; end if;
  if nullif(trim(p_transportista_cedula), '') is null then raise exception 'CEDULA_REQUIRED'; end if;
  if nullif(trim(p_placa_camion), '') is null then raise exception 'PLACA_REQUIRED'; end if;
  if nullif(trim(p_factura_path), '') is null then raise exception 'FACTURA_EVIDENCE_REQUIRED'; end if;
  if nullif(trim(p_material_path), '') is null then raise exception 'MATERIAL_EVIDENCE_REQUIRED'; end if;

  v_estado := case when v_flujo = 'pesado' then 'pendiente_entrega' else 'pendiente_proceso' end;

  insert into public.devoluciones (
    factura,
    articulo,
    cantidad,
    estado_material,
    descripcion_material,
    transportista_nombre,
    transportista_cedula,
    placa_camion,
    estado,
    foto_factura_url,
    foto_tarima_url,
    foto_material_url,
    flujo_inicial,
    creado_por
  )
  values (
    trim(p_factura),
    trim(p_articulo),
    p_cantidad,
    v_clasificacion,
    trim(p_descripcion),
    trim(p_transportista_nombre),
    trim(p_transportista_cedula),
    trim(p_placa_camion),
    v_estado,
    trim(p_factura_path),
    trim(p_material_path),
    trim(p_material_path),
    v_flujo,
    auth.uid()
  )
  returning id into v_id;

  insert into public.devolucion_evidencias (
    devolucion_id, etapa, tipo, url, creado_por
  )
  values
    (v_id, 'inicial', 'factura_inicial', trim(p_factura_path), auth.uid()),
    (v_id, 'inicial', 'material_inicial', trim(p_material_path), auth.uid());

  perform public.ep3_record_event(
    v_id,
    null,
    'devolucion_creada',
    null,
    v_estado,
    jsonb_build_object(
      'flujo', v_flujo,
      'clasificacion', v_clasificacion,
      'cantidad', p_cantidad
    )
  );

  perform public.ep3_notify(
    'Nueva devolucion',
    'Se registro una nueva devolucion.',
    'devolucion_creada',
    case when v_flujo = 'pesado' then 'pesado'::public.app_role else 'inventario'::public.app_role end,
    v_id
  );

  return v_id;
end;
$$;

create or replace function public.confirmar_recepcion_devolucion(
  p_devolucion_id uuid,
  p_cantidad_recibida integer,
  p_clasificacion text,
  p_cantidad_bueno integer,
  p_cantidad_malo integer,
  p_observaciones text,
  p_factura_firmada_path text,
  p_material_bueno_path text,
  p_material_malo_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_d public.devoluciones%rowtype;
  v_clasificacion text := lower(trim(p_clasificacion));
  v_good_id uuid;
  v_bad_id uuid;
begin
  perform public.ep3_assert_role(array['admin','pesado']::public.app_role[]);

  select * into v_d
  from public.devoluciones
  where id = p_devolucion_id
  for update;

  if not found then raise exception 'DEVOLUCION_NOT_FOUND'; end if;
  if v_d.flujo_inicial <> 'pesado' or v_d.estado <> 'pendiente_entrega' then
    raise exception 'INVALID_RECEPTION_STATE';
  end if;
  if v_d.recepcion_validada then raise exception 'RECEPTION_ALREADY_DONE'; end if;
  if p_cantidad_recibida is null or p_cantidad_recibida <= 0 then raise exception 'RECEIVED_QTY_INVALID'; end if;
  if v_clasificacion not in ('bueno','malo','mixto') then raise exception 'CLASIFICACION_INVALID'; end if;
  if nullif(trim(p_factura_firmada_path), '') is null then raise exception 'SIGNED_INVOICE_REQUIRED'; end if;

  if exists (
    select 1 from public.devolucion_materiales where devolucion_id = p_devolucion_id
  ) then
    raise exception 'MATERIALS_ALREADY_EXIST';
  end if;

  if v_clasificacion = 'bueno' then
    if nullif(trim(p_material_bueno_path), '') is null then raise exception 'GOOD_EVIDENCE_REQUIRED'; end if;

    insert into public.devolucion_materiales (
      devolucion_id, tipo_material, cantidad, estado, descripcion, creado_por
    )
    values (
      p_devolucion_id, 'bueno', p_cantidad_recibida, 'recibido', v_d.descripcion_material, auth.uid()
    )
    returning id into v_good_id;

  elsif v_clasificacion = 'malo' then
    if nullif(trim(p_material_malo_path), '') is null then raise exception 'BAD_EVIDENCE_REQUIRED'; end if;

    insert into public.devolucion_materiales (
      devolucion_id, tipo_material, cantidad, estado, descripcion, creado_por
    )
    values (
      p_devolucion_id, 'malo', p_cantidad_recibida, 'recibido', v_d.descripcion_material, auth.uid()
    )
    returning id into v_bad_id;

  else
    if p_cantidad_bueno is null or p_cantidad_bueno <= 0 then raise exception 'GOOD_QTY_INVALID'; end if;
    if p_cantidad_malo is null or p_cantidad_malo <= 0 then raise exception 'BAD_QTY_INVALID'; end if;
    if p_cantidad_bueno + p_cantidad_malo <> p_cantidad_recibida then raise exception 'MIXED_QTY_MISMATCH'; end if;
    if nullif(trim(p_material_bueno_path), '') is null then raise exception 'GOOD_EVIDENCE_REQUIRED'; end if;
    if nullif(trim(p_material_malo_path), '') is null then raise exception 'BAD_EVIDENCE_REQUIRED'; end if;

    insert into public.devolucion_materiales (
      devolucion_id, tipo_material, cantidad, estado, descripcion, creado_por
    )
    values (
      p_devolucion_id, 'bueno', p_cantidad_bueno, 'recibido', v_d.descripcion_material, auth.uid()
    )
    returning id into v_good_id;

    insert into public.devolucion_materiales (
      devolucion_id, tipo_material, cantidad, estado, descripcion, creado_por
    )
    values (
      p_devolucion_id, 'malo', p_cantidad_malo, 'recibido', v_d.descripcion_material, auth.uid()
    )
    returning id into v_bad_id;
  end if;

  update public.devoluciones
  set estado_material = v_clasificacion,
      estado = 'recibida_bodega',
      recibido_por = auth.uid(),
      recibido_at = now(),
      recepcion_validada = true,
      recepcion_observaciones = nullif(trim(p_observaciones), ''),
      recepcion_cantidad_recibida = p_cantidad_recibida,
      recepcion_validada_at = now()
  where id = p_devolucion_id;

  insert into public.devolucion_evidencias (
    devolucion_id, material_id, etapa, tipo, url, creado_por
  )
  values (
    p_devolucion_id, null, 'recepcion', 'factura_firmada', trim(p_factura_firmada_path), auth.uid()
  );

  if v_good_id is not null then
    insert into public.devolucion_evidencias (
      devolucion_id, material_id, etapa, tipo, url, creado_por
    )
    values (
      p_devolucion_id, v_good_id, 'recepcion', 'material_bueno', trim(p_material_bueno_path), auth.uid()
    );
  end if;

  if v_bad_id is not null then
    insert into public.devolucion_evidencias (
      devolucion_id, material_id, etapa, tipo, url, creado_por
    )
    values (
      p_devolucion_id, v_bad_id, 'recepcion', 'material_malo', trim(p_material_malo_path), auth.uid()
    );
  end if;

  perform public.ep3_record_event(
    p_devolucion_id,
    null,
    'recepcion_confirmada',
    v_d.estado,
    'recibida_bodega',
    jsonb_build_object(
      'clasificacion', v_clasificacion,
      'cantidad_recibida', p_cantidad_recibida,
      'cantidad_bueno', p_cantidad_bueno,
      'cantidad_malo', p_cantidad_malo,
      'observaciones', nullif(trim(p_observaciones), '')
    )
  );

  perform public.ep3_notify(
    'Recepcion confirmada',
    'La devolucion esta lista para Inventario.',
    'recepcion_confirmada',
    'inventario',
    p_devolucion_id
  );
end;
$$;

create or replace function public.procesar_inventario_devolucion(
  p_devolucion_id uuid,
  p_pallet_codigo text,
  p_observaciones text,
  p_evidencia_path text,
  p_cantidad_bueno integer,
  p_cantidad_malo integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_d public.devoluciones%rowtype;
  v_count integer;
  v_updated integer;
begin
  perform public.ep3_assert_role(array['admin','inventario']::public.app_role[]);

  if nullif(trim(p_pallet_codigo), '') is null then raise exception 'PALLET_REQUIRED'; end if;
  if nullif(trim(p_evidencia_path), '') is null then raise exception 'PALLET_EVIDENCE_REQUIRED'; end if;

  select * into v_d
  from public.devoluciones
  where id = p_devolucion_id
  for update;

  if not found then raise exception 'DEVOLUCION_NOT_FOUND'; end if;

  if v_d.flujo_inicial = 'pesado' and v_d.estado <> 'recibida_bodega' then
    raise exception 'INVALID_INVENTORY_STATE_PESADO';
  end if;

  if v_d.flujo_inicial = 'almacen' and v_d.estado <> 'pendiente_proceso' then
    raise exception 'INVALID_INVENTORY_STATE_ALMACEN';
  end if;

  select count(*)::integer into v_count
  from public.devolucion_materiales
  where devolucion_id = p_devolucion_id;

  if v_d.flujo_inicial = 'pesado' and v_count = 0 then
    raise exception 'PESADO_RECEPTION_MATERIALS_REQUIRED';
  end if;

  if v_d.flujo_inicial = 'almacen' and v_count = 0 then
    if v_d.estado_material = 'bueno' then
      insert into public.devolucion_materiales (
        devolucion_id, tipo_material, cantidad, estado, descripcion, creado_por
      )
      values (
        p_devolucion_id, 'bueno', v_d.cantidad, 'recibido', v_d.descripcion_material, auth.uid()
      );

    elsif v_d.estado_material = 'malo' then
      insert into public.devolucion_materiales (
        devolucion_id, tipo_material, cantidad, estado, descripcion, creado_por
      )
      values (
        p_devolucion_id, 'malo', v_d.cantidad, 'recibido', v_d.descripcion_material, auth.uid()
      );

    elsif v_d.estado_material = 'mixto' then
      if p_cantidad_bueno is null or p_cantidad_bueno <= 0 then raise exception 'GOOD_QTY_INVALID'; end if;
      if p_cantidad_malo is null or p_cantidad_malo <= 0 then raise exception 'BAD_QTY_INVALID'; end if;
      if p_cantidad_bueno + p_cantidad_malo <> v_d.cantidad then raise exception 'MIXED_QTY_MISMATCH'; end if;

      insert into public.devolucion_materiales (
        devolucion_id, tipo_material, cantidad, estado, descripcion, creado_por
      )
      values
        (p_devolucion_id, 'bueno', p_cantidad_bueno, 'recibido', v_d.descripcion_material, auth.uid()),
        (p_devolucion_id, 'malo', p_cantidad_malo, 'recibido', v_d.descripcion_material, auth.uid());
    else
      raise exception 'CLASIFICACION_INVALID';
    end if;
  end if;

  update public.devolucion_materiales
  set pallet_codigo = trim(p_pallet_codigo),
      observaciones = nullif(trim(p_observaciones), ''),
      estado = case
        when tipo_material = 'bueno' then 'pendiente_ubicar'
        else 'pendiente_disposicion'
      end,
      actualizado_por = auth.uid()
  where devolucion_id = p_devolucion_id
    and estado = 'recibido';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'NO_RECEIVED_MATERIALS_TO_PROCESS';
  end if;

  update public.devoluciones
  set pallet_por = auth.uid(),
      pallet_at = now()
  where id = p_devolucion_id;

  insert into public.devolucion_evidencias (
    devolucion_id, etapa, tipo, url, creado_por
  )
  values (
    p_devolucion_id, 'pallet', 'pallet', trim(p_evidencia_path), auth.uid()
  );

  perform public.ep3_record_event(
    p_devolucion_id,
    null,
    'inventario_procesado',
    v_d.estado,
    v_d.estado,
    jsonb_build_object(
      'pallet_codigo', trim(p_pallet_codigo),
      'observaciones', nullif(trim(p_observaciones), '')
    )
  );

  if exists (
    select 1 from public.devolucion_materiales
    where devolucion_id = p_devolucion_id
      and tipo_material = 'bueno'
      and estado = 'pendiente_ubicar'
  ) then
    perform public.ep3_notify(
      'Material pendiente de ubicacion',
      'Existe material bueno pendiente de ubicacion.',
      'pendiente_ubicar',
      case when v_d.flujo_inicial = 'pesado' then 'pesado'::public.app_role else 'almacen'::public.app_role end,
      p_devolucion_id
    );
  end if;

  if exists (
    select 1 from public.devolucion_materiales
    where devolucion_id = p_devolucion_id
      and tipo_material = 'malo'
      and estado = 'pendiente_disposicion'
  ) then
    perform public.ep3_notify(
      'Material pendiente de disposicion',
      'Existe material malo pendiente de disposicion.',
      'pendiente_disposicion',
      'inventario',
      p_devolucion_id
    );
  end if;

  perform public.ep3_recalculate_parent(p_devolucion_id);
end;
$$;

create or replace function public.ubicar_material_devolucion(
  p_material_id uuid,
  p_ubicacion text,
  p_observaciones text,
  p_evidencia_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.devolucion_materiales%rowtype;
  v_d public.devoluciones%rowtype;
  v_role public.app_role;
begin
  v_role := public.ep3_assert_role(array['admin','pesado','almacen']::public.app_role[]);

  if nullif(trim(p_ubicacion), '') is null then raise exception 'LOCATION_REQUIRED'; end if;

  select * into v_m
  from public.devolucion_materiales
  where id = p_material_id
  for update;

  if not found then raise exception 'MATERIAL_NOT_FOUND'; end if;

  select * into v_d
  from public.devoluciones
  where id = v_m.devolucion_id
  for update;

  if v_m.tipo_material <> 'bueno' or v_m.estado <> 'pendiente_ubicar' then
    raise exception 'INVALID_LOCATION_MATERIAL_STATE';
  end if;

  if v_role <> 'admin' then
    if v_d.flujo_inicial = 'pesado' and v_role <> 'pesado' then
      raise exception 'FORBIDDEN_FLOW_LOCATION';
    end if;
    if v_d.flujo_inicial = 'almacen' and v_role <> 'almacen' then
      raise exception 'FORBIDDEN_FLOW_LOCATION';
    end if;
  end if;

  update public.devolucion_materiales
  set ubicacion = trim(p_ubicacion),
      observaciones = coalesce(nullif(trim(p_observaciones), ''), observaciones),
      estado = 'cerrada',
      actualizado_por = auth.uid(),
      cerrado_por = auth.uid(),
      cerrado_at = now()
  where id = p_material_id;

  update public.devoluciones
  set ubicado_por = auth.uid(),
      ubicado_at = now()
  where id = v_m.devolucion_id;

  if nullif(trim(coalesce(p_evidencia_path, '')), '') is not null then
    insert into public.devolucion_evidencias (
      devolucion_id, material_id, etapa, tipo, url, creado_por
    )
    values (
      v_m.devolucion_id, p_material_id, 'ubicacion', 'ubicacion', trim(p_evidencia_path), auth.uid()
    );
  end if;

  perform public.ep3_record_event(
    v_m.devolucion_id,
    p_material_id,
    'material_ubicado',
    v_m.estado,
    'cerrada',
    jsonb_build_object(
      'ubicacion', trim(p_ubicacion),
      'observaciones', nullif(trim(p_observaciones), '')
    )
  );

  perform public.ep3_recalculate_parent(v_m.devolucion_id);
end;
$$;

create or replace function public.disponer_material_devolucion(
  p_material_id uuid,
  p_decision_final text,
  p_observaciones text,
  p_evidencia_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.devolucion_materiales%rowtype;
begin
  perform public.ep3_assert_role(array['admin','inventario']::public.app_role[]);

  if nullif(trim(p_decision_final), '') is null then raise exception 'FINAL_DECISION_REQUIRED'; end if;
  if nullif(trim(p_observaciones), '') is null then raise exception 'DISPOSITION_OBSERVATION_REQUIRED'; end if;
  if nullif(trim(p_evidencia_path), '') is null then raise exception 'DISPOSITION_EVIDENCE_REQUIRED'; end if;

  select * into v_m
  from public.devolucion_materiales
  where id = p_material_id
  for update;

  if not found then raise exception 'MATERIAL_NOT_FOUND'; end if;

  if v_m.tipo_material <> 'malo' or v_m.estado <> 'pendiente_disposicion' then
    raise exception 'INVALID_DISPOSITION_MATERIAL_STATE';
  end if;

  update public.devolucion_materiales
  set decision_final = trim(p_decision_final),
      observaciones = trim(p_observaciones),
      estado = 'cerrada',
      actualizado_por = auth.uid(),
      cerrado_por = auth.uid(),
      cerrado_at = now()
  where id = p_material_id;

  update public.devoluciones
  set disposicion_por = auth.uid(),
      disposicion_at = now()
  where id = v_m.devolucion_id;

  insert into public.devolucion_evidencias (
    devolucion_id, material_id, etapa, tipo, url, descripcion, creado_por
  )
  values (
    v_m.devolucion_id,
    p_material_id,
    'disposicion',
    'disposicion',
    trim(p_evidencia_path),
    trim(p_decision_final),
    auth.uid()
  );

  perform public.ep3_record_event(
    v_m.devolucion_id,
    p_material_id,
    'material_dispuesto',
    v_m.estado,
    'cerrada',
    jsonb_build_object(
      'decision_final', trim(p_decision_final),
      'observaciones', trim(p_observaciones)
    )
  );

  perform public.ep3_recalculate_parent(v_m.devolucion_id);
end;
$$;

create or replace function public.admin_eliminar_devolucion(p_devolucion_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_d public.devoluciones%rowtype;
  v_snapshot jsonb;
begin
  perform public.ep3_assert_role(array['admin']::public.app_role[]);

  select * into v_d
  from public.devoluciones
  where id = p_devolucion_id
  for update;

  if not found then
    return false;
  end if;

  select jsonb_build_object(
    'devolucion', to_jsonb(v_d),
    'materiales', coalesce(
      (select jsonb_agg(to_jsonb(m)) from public.devolucion_materiales m where m.devolucion_id = p_devolucion_id),
      '[]'::jsonb
    ),
    'evidencias', coalesce(
      (select jsonb_agg(to_jsonb(e)) from public.devolucion_evidencias e where e.devolucion_id = p_devolucion_id),
      '[]'::jsonb
    ),
    'historial', coalesce(
      (select jsonb_agg(to_jsonb(h)) from public.devolucion_historial h where h.devolucion_id = p_devolucion_id),
      '[]'::jsonb
    )
  )
  into v_snapshot;

  insert into public.devolucion_delete_audit (
    devolucion_id, factura, snapshot, deleted_by
  )
  values (
    p_devolucion_id, v_d.factura, v_snapshot, auth.uid()
  );

  delete from public.devoluciones
  where id = p_devolucion_id;

  return true;
end;
$$;

create or replace function public.buscar_devoluciones(
  p_search text,
  p_estado text,
  p_material text,
  p_flujo text,
  p_desde date,
  p_hasta date,
  p_limit integer,
  p_offset integer
)
returns setof public.devoluciones
language sql
stable
security invoker
set search_path = public
as $$
  select d.*
  from public.devoluciones d
  where
    (nullif(trim(p_search), '') is null
      or d.factura ilike '%' || trim(p_search) || '%'
      or d.articulo ilike '%' || trim(p_search) || '%')
    and (nullif(trim(p_estado), '') is null or d.estado = trim(p_estado))
    and (nullif(trim(p_material), '') is null or d.estado_material = trim(p_material))
    and (nullif(trim(p_flujo), '') is null or d.flujo_inicial = trim(p_flujo))
    and (p_desde is null or d.created_at >= p_desde::timestamptz)
    and (p_hasta is null or d.created_at < (p_hasta + 1)::timestamptz)
  order by d.created_at desc
  limit least(greatest(coalesce(p_limit, 21), 1), 101)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Keep internal helpers private.
revoke all on function public.ep3_assert_role(public.app_role[]) from public, anon, authenticated;
revoke all on function public.ep3_record_event(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ep3_notify(text, text, text, public.app_role, uuid) from public, anon, authenticated;
revoke all on function public.ep3_recalculate_parent(uuid) from public, anon, authenticated;

-- Expose only the operational RPCs to signed-in users.
revoke all on function public.crear_devolucion(text,text,integer,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.confirmar_recepcion_devolucion(uuid,integer,text,integer,integer,text,text,text,text) from public, anon, authenticated;
revoke all on function public.procesar_inventario_devolucion(uuid,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.ubicar_material_devolucion(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.disponer_material_devolucion(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_eliminar_devolucion(uuid) from public, anon, authenticated;
revoke all on function public.buscar_devoluciones(text,text,text,text,date,date,integer,integer) from public, anon, authenticated;

grant execute on function public.crear_devolucion(text,text,integer,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.confirmar_recepcion_devolucion(uuid,integer,text,integer,integer,text,text,text,text) to authenticated;
grant execute on function public.procesar_inventario_devolucion(uuid,text,text,text,integer,integer) to authenticated;
grant execute on function public.ubicar_material_devolucion(uuid,text,text,text) to authenticated;
grant execute on function public.disponer_material_devolucion(uuid,text,text,text) to authenticated;
grant execute on function public.admin_eliminar_devolucion(uuid) to authenticated;
grant execute on function public.buscar_devoluciones(text,text,text,text,date,date,integer,integer) to authenticated;

-- Private bucket: authenticated operational users can read evidence.
drop policy if exists ddevoluciones_evidence_read on storage.objects;
create policy ddevoluciones_evidence_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'devoluciones'
  and public.current_user_is_active()
  and public.current_user_role() in ('admin','devoluciones','pesado','inventario','almacen')
);

-- Uploads must live under the uploader UUID prefix.
drop policy if exists ddevoluciones_evidence_insert on storage.objects;
create policy ddevoluciones_evidence_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'devoluciones'
  and public.current_user_is_active()
  and public.current_user_role() in ('admin','devoluciones','pesado','inventario','almacen')
  and (storage.foldername(name))[1] = auth.uid()::text
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
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

commit;