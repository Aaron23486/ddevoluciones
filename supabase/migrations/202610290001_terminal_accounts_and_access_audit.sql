-- ==========================================================
-- DDEVOLUCIONES - TERMINAL ACCOUNTS AND ACCESS AUDIT
-- Forward-only.
--
-- Accounts are created and managed from the terminal
-- (`npm run demo:setup`, `npm run users`), never through a
-- public sign-up or an access-request queue. This migration:
--
-- 1. Retires the access-request flow (table, enums, RPCs and
--    notification trigger). New Auth users still get an
--    inactive profile with the least privileged role.
-- 2. Keeps at least one active admin, whichever path changes
--    profiles (admin RPCs or the service role).
-- 3. Records every role or status change in
--    profile_access_events.
-- ==========================================================

begin;

-- ----------------------------------------------------------
-- 1. New Auth users: inactive profile, no access request.
-- ----------------------------------------------------------

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if new.email is null or not public.is_allowed_company_email(new.email) then
    raise exception 'A valid email is required';
  end if;

  v_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null then
    v_name := split_part(lower(new.email), '@', 1);
  end if;

  -- Client metadata never grants a role or activates the account.
  insert into public.profiles (id, email, full_name, role, is_active)
  values (new.id, lower(new.email), v_name, 'devoluciones', false)
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      is_active = false,
      updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_access_request on auth.users;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

drop trigger if exists user_access_request_notifications_ep4 on public.user_access_requests;
drop function if exists public.ep4_user_request_notifications();
drop function if exists public.approve_user_access_request(uuid, public.app_role, text);
drop function if exists public.reject_user_access_request(uuid, text);
drop function if exists public.handle_new_user_access_request();
drop function if exists public.map_area_to_role(public.requestable_area);
drop table if exists public.user_access_requests;
drop type if exists public.requestable_area;
drop type if exists public.access_request_status;

-- ----------------------------------------------------------
-- 2. Keep at least one active admin.
-- ----------------------------------------------------------

create or replace function public.keep_an_active_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'admin'::public.app_role
     and old.is_active
     and (
       tg_op = 'DELETE'
       or new.role <> 'admin'::public.app_role
       or not new.is_active
     ) then
    -- Serializes concurrent changes to admin accounts.
    perform pg_advisory_xact_lock(hashtextextended('ddevoluciones.active_admins', 0));

    if not exists (
      select 1
      from public.profiles p
      where p.role = 'admin'::public.app_role
        and p.is_active
        and p.id <> old.id
    ) then
      raise exception 'LAST_ADMIN_REQUIRED' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.keep_an_active_admin() from public, anon, authenticated;

drop trigger if exists profiles_keep_an_active_admin on public.profiles;

create trigger profiles_keep_an_active_admin
before update of role, is_active or delete
on public.profiles
for each row
execute function public.keep_an_active_admin();

-- ----------------------------------------------------------
-- 3. Access audit trail.
-- ----------------------------------------------------------

create table if not exists public.profile_access_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- null when the change comes from the terminal (service role).
  changed_by uuid references auth.users(id) on delete set null,
  old_role public.app_role,
  new_role public.app_role not null,
  old_is_active boolean,
  new_is_active boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_profile_access_events_profile
  on public.profile_access_events(profile_id, created_at desc);

alter table public.profile_access_events enable row level security;

revoke all on table public.profile_access_events from anon, authenticated;
grant select on table public.profile_access_events to authenticated;
grant select on table public.profile_access_events to service_role;

drop policy if exists profile_access_events_admin_select on public.profile_access_events;
create policy profile_access_events_admin_select
on public.profile_access_events
for select
to authenticated
using (public.current_user_role() = 'admin');

create or replace function public.record_profile_access_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
  then
    insert into public.profile_access_events (
      profile_id, changed_by, old_role, new_role, old_is_active, new_is_active
    ) values (
      new.id,
      auth.uid(),
      case when tg_op = 'UPDATE' then old.role end,
      new.role,
      case when tg_op = 'UPDATE' then old.is_active end,
      new.is_active
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_profile_access_event() from public, anon, authenticated;

drop trigger if exists profiles_record_access_event on public.profiles;

create trigger profiles_record_access_event
after insert or update of role, is_active
on public.profiles
for each row
execute function public.record_profile_access_event();

commit;
