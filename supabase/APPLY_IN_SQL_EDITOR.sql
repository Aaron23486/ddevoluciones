-- ==========================================================
-- FILE: 202610050001_access_foundation.sql
-- ==========================================================
begin;

-- ==========================================================
-- DDEVOLUCIONES / EPICA 2
-- ACCESS FOUNDATION
-- ==========================================================

create extension if not exists pgcrypto;

-- Seven roles are intentionally unified here. The original system had
-- a 5-role PostgreSQL enum while the UI expected 7 roles.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
  ) then
    create type public.app_role as enum (
      'admin',
      'devoluciones',
      'pesado',
      'inventario',
      'almacen',
      'transportes',
      'seguridad'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'requestable_area'
  ) then
    create type public.requestable_area as enum (
      'devoluciones',
      'pesado',
      'inventario',
      'almacen'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'access_request_status'
  ) then
    create type public.access_request_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.app_role not null default 'devoluciones',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  requested_area public.requestable_area not null,
  assigned_role public.app_role not null,
  status public.access_request_status not null default 'pending',
  admin_notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_access_requests_status
  on public.user_access_requests(status);
create index if not exists idx_access_requests_email
  on public.user_access_requests(email);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists access_requests_set_updated_at on public.user_access_requests;
create trigger access_requests_set_updated_at
before update on public.user_access_requests
for each row execute function public.set_updated_at();

create or replace function public.is_allowed_company_email(p_email text)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select lower(split_part(trim(p_email), '@', 2)) in ('example.com', 'example.org');
$$;

create or replace function public.map_area_to_role(p_area public.requestable_area)
returns public.app_role
language sql
immutable
security invoker
set search_path = public
as $$
  select p_area::text::public.app_role;
$$;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
  );
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;
$$;

create or replace function public.handle_new_user_access_request()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_area_text text;
  v_area public.requestable_area;
  v_role public.app_role;
begin
  v_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_area_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'requested_area', '')), '');

  if new.email is null or not public.is_allowed_company_email(new.email) then
    raise exception 'Email domain is not allowed';
  end if;

  if v_name is null then
    raise exception 'full_name is required';
  end if;

  begin
    v_area := v_area_text::public.requestable_area;
  exception when others then
    raise exception 'requested_area is invalid';
  end;

  v_role := public.map_area_to_role(v_area);

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    is_active
  ) values (
    new.id,
    lower(new.email),
    v_name,
    v_role,
    false
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      is_active = false,
      updated_at = now();

  insert into public.user_access_requests (
    user_id,
    email,
    full_name,
    requested_area,
    assigned_role,
    status
  ) values (
    new.id,
    lower(new.email),
    v_name,
    v_area,
    v_role,
    'pending'
  )
  on conflict (user_id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      requested_area = excluded.requested_area,
      assigned_role = excluded.assigned_role,
      status = 'pending',
      admin_notes = null,
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_access_request on auth.users;
create trigger on_auth_user_created_access_request
after insert on auth.users
for each row execute function public.handle_new_user_access_request();

create or replace function public.assert_current_user_is_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Admin role required';
  end if;
end;
$$;

create or replace function public.approve_user_access_request(
  p_request_id uuid,
  p_role public.app_role default null,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.user_access_requests%rowtype;
  v_role public.app_role;
begin
  perform public.assert_current_user_is_admin();

  select * into v_request
  from public.user_access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be approved';
  end if;

  v_role := coalesce(p_role, v_request.assigned_role);

  update public.profiles
  set role = v_role,
      is_active = true,
      updated_at = now()
  where id = v_request.user_id;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_request.user_id;

  update public.user_access_requests
  set assigned_role = v_role,
      status = 'approved',
      admin_notes = nullif(trim(p_admin_notes), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.reject_user_access_request(
  p_request_id uuid,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.user_access_requests%rowtype;
begin
  perform public.assert_current_user_is_admin();

  select * into v_request
  from public.user_access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be rejected';
  end if;

  update public.profiles
  set is_active = false,
      updated_at = now()
  where id = v_request.user_id;

  update public.user_access_requests
  set status = 'rejected',
      admin_notes = nullif(trim(p_admin_notes), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.admin_set_user_active(
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_current_user_is_admin();

  if p_user_id = auth.uid() and p_is_active = false then
    raise exception 'You cannot deactivate your own admin account';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set is_active = p_is_active,
      updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_current_user_is_admin();

  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own admin role';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set role = p_role,
      updated_at = now()
  where id = p_user_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_access_requests enable row level security;

-- Explicitly remove broad API privileges before granting the minimum set.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_access_requests from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.user_access_requests to authenticated;

-- RLS: own profile and own request; admins can read all.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_admin_select_all on public.profiles;
create policy profiles_admin_select_all
on public.profiles
for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists access_requests_select_own on public.user_access_requests;
create policy access_requests_select_own
on public.user_access_requests
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists access_requests_admin_select_all on public.user_access_requests;
create policy access_requests_admin_select_all
on public.user_access_requests
for select
to authenticated
using (public.current_user_role() = 'admin');

-- Functions are deny-by-default too.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_allowed_company_email(text) from public, anon, authenticated;
revoke all on function public.map_area_to_role(public.requestable_area) from public, anon, authenticated;
revoke all on function public.handle_new_user_access_request() from public, anon, authenticated;
revoke all on function public.current_user_is_active() from public, anon, authenticated;
revoke all on function public.current_user_role() from public, anon, authenticated;
revoke all on function public.current_profile_role() from public, anon, authenticated;
revoke all on function public.assert_current_user_is_admin() from public, anon, authenticated;
revoke all on function public.approve_user_access_request(uuid, public.app_role, text) from public, anon, authenticated;
revoke all on function public.reject_user_access_request(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon, authenticated;

grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.approve_user_access_request(uuid, public.app_role, text) to authenticated;
grant execute on function public.reject_user_access_request(uuid, text) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;

commit;


-- ==========================================================
-- FILE: 202610050002_confirmed_domain_schema.sql
-- ==========================================================
begin;

-- ==========================================================
-- DDEVOLUCIONES / EPICA 2
-- CONFIRMED DOMAIN SCHEMA
-- Tables exist now, but domain access remains deny-by-default.
-- Operational RLS policies will be added with each business module.
-- ==========================================================

create table if not exists public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  factura text not null,
  articulo text not null,
  cantidad integer not null check (cantidad > 0),
  estado_material text not null,
  descripcion_material text not null,
  transportista_nombre text not null,
  transportista_cedula text not null,
  placa_camion text not null,
  estado text not null check (estado in (
    'pendiente_entrega',
    'pendiente_proceso',
    'recibida_bodega',
    'pendiente_ubicar',
    'pendiente_disposicion',
    'cerrada'
  )),
  foto_factura_url text,
  foto_tarima_url text,
  audit jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foto_material_url text,
  flujo_inicial text not null default 'pesado' check (flujo_inicial in ('pesado', 'almacen')),
  creado_por uuid references auth.users(id),
  recibido_por uuid references auth.users(id),
  pallet_por uuid references auth.users(id),
  ubicado_por uuid references auth.users(id),
  disposicion_por uuid references auth.users(id),
  cerrado_por uuid references auth.users(id),
  recibido_at timestamptz,
  pallet_at timestamptz,
  ubicado_at timestamptz,
  disposicion_at timestamptz,
  cerrado_at timestamptz,
  recepcion_validada boolean not null default false,
  recepcion_observaciones text,
  recepcion_cantidad_recibida integer,
  recepcion_validada_at timestamptz
);

create index if not exists idx_devoluciones_estado on public.devoluciones(estado);
create index if not exists idx_devoluciones_flujo on public.devoluciones(flujo_inicial);
create index if not exists idx_devoluciones_recepcion_validada on public.devoluciones(recepcion_validada);

create table if not exists public.devolucion_materiales (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones(id) on delete cascade,
  tipo_material text not null check (tipo_material in ('bueno', 'malo')),
  cantidad integer not null check (cantidad > 0),
  estado text not null default 'recibido' check (estado in (
    'recibido',
    'pendiente_ubicar',
    'pendiente_disposicion',
    'cerrada'
  )),
  descripcion text,
  pallet_codigo text,
  ubicacion text,
  observaciones text,
  creado_por uuid references auth.users(id),
  actualizado_por uuid references auth.users(id),
  cerrado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cerrado_at timestamptz
);

create index if not exists idx_materiales_devolucion on public.devolucion_materiales(devolucion_id);
create index if not exists idx_materiales_estado on public.devolucion_materiales(estado);
create index if not exists idx_materiales_tipo on public.devolucion_materiales(tipo_material);

create table if not exists public.devolucion_evidencias (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones(id) on delete cascade,
  material_id uuid references public.devolucion_materiales(id) on delete cascade,
  etapa text not null check (etapa in ('inicial', 'recepcion', 'pallet', 'ubicacion', 'disposicion', 'cierre')),
  tipo text not null check (tipo in (
    'factura_inicial',
    'material_inicial',
    'factura_firmada',
    'material_bueno',
    'material_malo',
    'pallet',
    'ubicacion',
    'destruccion',
    'disposicion',
    'otro'
  )),
  url text not null,
  descripcion text,
  creado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_evidencias_devolucion on public.devolucion_evidencias(devolucion_id);
create index if not exists idx_evidencias_material on public.devolucion_evidencias(material_id);

create table if not exists public.internal_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  event_type text not null check (event_type in (
    'devolucion_creada',
    'recepcion_confirmada',
    'pallet_registrado',
    'pendiente_ubicar',
    'pendiente_disposicion',
    'devolucion_cerrada',
    'usuario_pendiente',
    'usuario_aprobado',
    'usuario_rechazado',
    'reporte_carga_recibido',
    'reporte_carga_pendiente_envio',
    'reporte_carga_enviado'
  )),
  target_role public.app_role,
  target_user_id uuid references public.profiles(id) on delete set null,
  devolucion_id uuid references public.devoluciones(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  reporte_carga_id uuid
);

create table if not exists public.internal_notification_reads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.internal_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique(notification_id, user_id)
);

create index if not exists idx_notification_reads_user on public.internal_notification_reads(user_id);

create table if not exists public.reportes_carga (
  id uuid primary key default gen_random_uuid(),
  numero_documento text,
  factura text,
  cliente text not null,
  articulo text,
  descripcion_material text,
  cantidad integer not null check (cantidad > 0),
  transportista text,
  ruta text,
  placa text,
  motivo_no_entrega text not null,
  estado_fisico_carga text,
  observaciones_retorno text,
  estado text not null default 'recibido_muelle' check (estado in ('recibido_muelle', 'pendiente_redespacho', 'redespachado')),
  recibido_por uuid references auth.users(id) on delete set null,
  recibido_at timestamptz,
  redespachado_por uuid references auth.users(id) on delete set null,
  redespachado_at timestamptz,
  observaciones_redespacho text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  conductor_envio text,
  placa_envio text
);

create index if not exists idx_reportes_carga_cliente on public.reportes_carga(cliente);
create index if not exists idx_reportes_carga_estado on public.reportes_carga(estado);
create index if not exists idx_reportes_carga_factura on public.reportes_carga(factura);
create index if not exists idx_reportes_carga_active on public.reportes_carga(is_active);
create index if not exists idx_reportes_carga_created_at on public.reportes_carga(created_at desc);
create index if not exists idx_reportes_carga_transportista on public.reportes_carga(transportista);
create index if not exists idx_reportes_carga_ruta on public.reportes_carga(ruta);
create index if not exists idx_reportes_carga_placa on public.reportes_carga(placa);
create index if not exists idx_reportes_carga_placa_envio on public.reportes_carga(placa_envio);
create index if not exists idx_reportes_carga_recibido_at on public.reportes_carga(recibido_at);
create index if not exists idx_reportes_carga_redespachado_at on public.reportes_carga(redespachado_at);

create table if not exists public.reportes_carga_evidencias (
  id uuid primary key default gen_random_uuid(),
  reporte_carga_id uuid not null references public.reportes_carga(id) on delete cascade,
  tipo text not null check (tipo in ('recepcion_carga', 'estado_carga', 'documento_firmado', 'redespacho', 'otra')),
  url text not null,
  descripcion text,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reportes_carga_evidencias_reporte
  on public.reportes_carga_evidencias(reporte_carga_id);

create table if not exists public.reportes_carga_historial (
  id uuid primary key default gen_random_uuid(),
  reporte_carga_id uuid not null references public.reportes_carga(id) on delete cascade,
  accion text not null check (accion in ('retorno_registrado', 'estado_actualizado', 'redespacho_registrado', 'reporte_anulado')),
  estado_anterior text check (estado_anterior is null or estado_anterior in ('recibido_muelle', 'pendiente_redespacho', 'redespachado')),
  estado_nuevo text check (estado_nuevo is null or estado_nuevo in ('recibido_muelle', 'pendiente_redespacho', 'redespachado')),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nombre text,
  observacion text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reportes_carga_historial_reporte
  on public.reportes_carga_historial(reporte_carga_id);
create index if not exists idx_reportes_carga_historial_created_at
  on public.reportes_carga_historial(created_at desc);

-- Now that reportes_carga exists, complete the notification FK.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'internal_notifications_reporte_carga_id_fkey'
      and conrelid = 'public.internal_notifications'::regclass
  ) then
    alter table public.internal_notifications
      add constraint internal_notifications_reporte_carga_id_fkey
      foreign key (reporte_carga_id)
      references public.reportes_carga(id)
      on delete cascade;
  end if;
end
$$;

-- Updated-at triggers.
drop trigger if exists devoluciones_set_updated_at on public.devoluciones;
create trigger devoluciones_set_updated_at
before update on public.devoluciones
for each row execute function public.set_updated_at();

drop trigger if exists materiales_set_updated_at on public.devolucion_materiales;
create trigger materiales_set_updated_at
before update on public.devolucion_materiales
for each row execute function public.set_updated_at();

drop trigger if exists reportes_carga_set_updated_at on public.reportes_carga;
create trigger reportes_carga_set_updated_at
before update on public.reportes_carga
for each row execute function public.set_updated_at();

-- RLS enabled now; no operational policies in Epica 2.
alter table public.devoluciones enable row level security;
alter table public.devolucion_materiales enable row level security;
alter table public.devolucion_evidencias enable row level security;
alter table public.internal_notifications enable row level security;
alter table public.internal_notification_reads enable row level security;
alter table public.reportes_carga enable row level security;
alter table public.reportes_carga_evidencias enable row level security;
alter table public.reportes_carga_historial enable row level security;

revoke all on table public.devoluciones from anon, authenticated;
revoke all on table public.devolucion_materiales from anon, authenticated;
revoke all on table public.devolucion_evidencias from anon, authenticated;
revoke all on table public.internal_notifications from anon, authenticated;
revoke all on table public.internal_notification_reads from anon, authenticated;
revoke all on table public.reportes_carga from anon, authenticated;
revoke all on table public.reportes_carga_evidencias from anon, authenticated;
revoke all on table public.reportes_carga_historial from anon, authenticated;

-- Private storage bucket. Visible UI behavior used a 5 MB cap and JPEG/PNG/WEBP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'devoluciones',
  'devoluciones',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;


-- ==========================================================
-- FILE: 202610050003_demo_login.sql
-- ==========================================================
begin;

-- ==========================================================
-- DDEVOLUCIONES / DEMO LOGIN
-- Forward-only migration.
-- Removes the original corporate-domain restriction without
-- granting privileged access to public signups.
-- ==========================================================

-- Compatibility function: the old name remains because migration 001
-- may already be deployed, but it no longer restricts corporate domains.
create or replace function public.is_allowed_company_email(p_email text)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select p_email is not null
     and length(trim(p_email)) between 3 and 320
     and trim(p_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;

-- A new Auth user may use any syntactically valid email.
-- IMPORTANT SECURITY RULE:
-- raw_user_meta_data is NOT trusted for privileged role assignment
-- or activation. Every ordinary new user is created inactive.
-- Demo users are activated later only by the trusted seed script,
-- which requires a Supabase Secret key / legacy service_role key.
create or replace function public.handle_new_user_access_request()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_area_text text;
  v_area public.requestable_area;
  v_role public.app_role;
begin
  if new.email is null or not public.is_allowed_company_email(new.email) then
    raise exception 'A valid email is required';
  end if;

  v_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null then
    v_name := split_part(lower(new.email), '@', 1);
  end if;

  -- Safe default. Never trust client metadata for admin/privileged roles.
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    is_active
  ) values (
    new.id,
    lower(new.email),
    v_name,
    'devoluciones',
    false
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      is_active = false,
      updated_at = now();

  -- Preserve the original access-request flow only when a valid
  -- requestable area is explicitly supplied. Invalid/privileged areas
  -- never auto-activate and never escalate a role.
  v_area_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'requested_area', '')), '');

  if v_area_text is not null then
    begin
      v_area := v_area_text::public.requestable_area;
      v_role := public.map_area_to_role(v_area);

      update public.profiles
      set role = v_role,
          updated_at = now()
      where id = new.id;

      insert into public.user_access_requests (
        user_id,
        email,
        full_name,
        requested_area,
        assigned_role,
        status
      ) values (
        new.id,
        lower(new.email),
        v_name,
        v_area,
        v_role,
        'pending'
      )
      on conflict (user_id) do update
      set email = excluded.email,
          full_name = excluded.full_name,
          requested_area = excluded.requested_area,
          assigned_role = excluded.assigned_role,
          status = 'pending',
          admin_notes = null,
          reviewed_by = null,
          reviewed_at = null,
          updated_at = now();
    exception
      when invalid_text_representation then
        null;
    end;
  end if;

  return new;
end;
$$;

-- Keep these internal helpers unavailable to browser roles.
revoke all on function public.is_allowed_company_email(text) from public, anon, authenticated;
revoke all on function public.handle_new_user_access_request() from public, anon, authenticated;

commit;

-- ==========================================================
-- FILE: 202610050004_demo_seed_service_role_grants.sql
-- ==========================================================
begin;

-- ==========================================================
-- DDEVOLUCIONES
-- 004 - DEMO SEED / SERVICE_ROLE MINIMUM GRANTS
--
-- SECURITY:
-- - Does NOT grant anything to anon.
-- - Does NOT expand authenticated permissions.
-- - service_role remains server-side only.
-- - RLS stays enabled.
-- ==========================================================

grant usage on schema public to service_role;

grant usage on type public.app_role to service_role;
grant usage on type public.requestable_area to service_role;
grant usage on type public.access_request_status to service_role;

grant select, insert, update, delete
on table public.profiles
to service_role;

grant select, insert, update, delete
on table public.user_access_requests
to service_role;

commit;

-- ==========================================================
-- FILE: 202610050005_epica3_operational_core.sql
-- ==========================================================
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

-- ==========================================================
-- FILE: 202610050006_epica4_reports_notifications_analytics.sql
-- ==========================================================
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

-- EPICA 6 / SECURITY HARDENING 007
begin;

-- ==========================================================
-- DDEVOLUCIONES - EPICA 6
-- SECURITY HARDENING
--
-- 1. Prevent direct execution of the automatic RLS event
--    trigger function by application roles.
-- 2. Protect evidence already referenced by business records.
-- ==========================================================

revoke all
on function public.rls_auto_enable()
from public, anon, authenticated;


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
