begin;

-- ==========================================================
-- DDEVOLUCIONES / DEMO LOGIN
-- Forward-only migration.
-- Keeps account creation open to any valid email without
-- granting privileged access to new accounts.
-- ==========================================================

-- Compatibility function: the name remains because migration 001
-- may already be deployed; it only checks the email syntax.
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