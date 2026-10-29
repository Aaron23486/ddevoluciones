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
  select p_email is not null
     and length(trim(p_email)) between 3 and 320
     and trim(p_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
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
    raise exception 'A valid email is required';
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
