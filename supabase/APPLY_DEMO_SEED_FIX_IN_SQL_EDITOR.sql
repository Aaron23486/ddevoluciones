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