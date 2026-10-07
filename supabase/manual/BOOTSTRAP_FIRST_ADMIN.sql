-- ==========================================================
-- RUN ONLY AFTER:
-- 1. Migrations 001 and 002 are applied.
-- 2. You registered your own user through /login.
-- 3. Replace the placeholder below with YOUR registered email.
--
-- Run this manually in Supabase SQL Editor exactly once to create
-- the first active admin. Do not place this email in application code.
-- ==========================================================

do $$
declare
  v_email text := 'REPLACE_WITH_YOUR_REGISTERED_EMAIL';
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise exception 'User not found for email %', v_email;
  end if;

  if exists (
    select 1 from public.profiles
    where role = 'admin' and is_active = true
  ) then
    raise exception 'An active admin already exists. Bootstrap refused.';
  end if;

  update public.profiles
  set role = 'admin',
      is_active = true,
      updated_at = now()
  where id = v_user_id;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_user_id;

  update public.user_access_requests
  set assigned_role = 'admin',
      status = 'approved',
      admin_notes = 'Initial administrator bootstrap',
      reviewed_at = now(),
      updated_at = now()
  where user_id = v_user_id;
end
$$;
