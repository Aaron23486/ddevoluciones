-- ============================================================
-- DDEVOLUCIONES - PASSWORDS CHANGE ONLY FROM THE TERMINAL
-- Forward-only.
-- The application has no password screen: accounts and resets
-- are managed with `npm run users`. Supabase Auth, however,
-- lets any valid session change its own password through the
-- API, and only asks for reauthentication after 24 hours.
-- A stolen session could therefore lock the owner out.
--
-- auth.users now rejects any change of encrypted_password that
-- does not come from terminal_set_password(), which only the
-- service role can execute. It also closes the account's open
-- sessions, so a reset revokes access at once.
-- ============================================================

begin;

create or replace function public.guard_password_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and coalesce(current_setting('ddevoluciones.password_change', true), '') <> 'terminal'
  then
    raise exception 'PASSWORD_CHANGE_NOT_ALLOWED' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_password_changes() from public, anon, authenticated;

drop trigger if exists auth_users_guard_password_changes on auth.users;

create trigger auth_users_guard_password_changes
before update of encrypted_password on auth.users
for each row
execute function public.guard_password_changes();

create or replace function public.terminal_set_password(
  p_user_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if p_password is null
     or char_length(p_password) < 12
     or char_length(p_password) > 72
     or p_password !~ '[A-Za-z]'
     or p_password !~ '[0-9]'
  then
    raise exception 'PASSWORD_INVALID' using errcode = '22023';
  end if;

  -- Only for this transaction: lets the guard trigger accept the change.
  perform set_config('ddevoluciones.password_change', 'terminal', true);

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke all on function public.terminal_set_password(uuid, text) from public, anon, authenticated;
grant execute on function public.terminal_set_password(uuid, text) to service_role;

commit;
