-- DDEVOLUCIONES - ADMINISTRATIVE MILESTONES, FORWARD ONLY.
-- Install manually in Supabase SQL Editor AFTER all previous migrations.
-- No change to RLS, grants, operational RPCs or existing historical rows.
-- The original target role gets its existing notification; Admin gets one
-- separate, deduplicated copy of each NEW devolucion event.

begin;

do $guard$
begin
  if to_regclass('public.internal_notifications') is null
     or to_regclass('public.devoluciones') is null
     or to_regprocedure('public.get_my_notifications_ep4(integer)') is null
  then
    raise exception 'Required operational notifications schema is missing. Apply earlier migrations first.';
  end if;
end;
$guard$;

-- Guarantee one ADMIN creation alert per case, even under retries.
create unique index if not exists ddev_admin_devolucion_created_once
  on public.internal_notifications(devolucion_id, event_type)
  where target_role = 'admin'
    and event_type = 'devolucion_creada'
    and devolucion_id is not null;

create or replace function public.ddev_notify_admin_on_devolucion_creation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- This trigger receives only notifications, never the raw case INSERT.
  -- Therefore SQL demo fixtures and historical imports do not spam Admin.
  if new.event_type <> 'devolucion_creada'
     or new.devolucion_id is null
     or new.target_role is null
     or new.target_role not in ('pesado', 'inventario')
  then
    return new;
  end if;

  insert into public.internal_notifications (
    title, message, event_type, target_role, target_user_id,
    devolucion_id, created_by, is_system, created_at
  )
  select
    U&'Nueva devoluci\00F3n registrada',
    U&'Se registr\00F3 la devoluci\00F3n de la factura ' ||
    coalesce(nullif(trim(d.factura), ''), 'sin referencia') ||
    U&' correspondiente al art\00EDculo ' ||
    coalesce(nullif(trim(d.articulo), ''), 'no especificado') ||
    '. Flujo: ' ||
    case d.flujo_inicial
      when 'pesado' then 'Pesado'
      when 'almacen' then U&'Almac\00E9n'
      else coalesce(d.flujo_inicial, 'no especificado')
    end || '.',
    'devolucion_creada',
    'admin',
    null,
    new.devolucion_id,
    new.created_by,
    true,
    new.created_at
  from public.devoluciones d
  where d.id = new.devolucion_id
  on conflict do nothing;

  return new;
end;
$fn$;

revoke all on function public.ddev_notify_admin_on_devolucion_creation()
  from public, anon, authenticated;

drop trigger if exists ddev_admin_creation_notification
  on public.internal_notifications;
create trigger ddev_admin_creation_notification
  after insert on public.internal_notifications
  for each row
  execute function public.ddev_notify_admin_on_devolucion_creation();

commit;