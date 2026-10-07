-- OPTIONAL - RECENT ALREADY-CREATED CASES ONLY (7 DAYS).
-- Run manually AFTER applying the admin milestones migration.
-- Do NOT run unless the administrator wants historical arrivals.
-- It only copies existing operational event notices; it does not create
-- notifications for stress fixtures that never emitted operational events.
-- Existing personal inbox-clear cutoffs will continue to apply.

begin;

insert into public.internal_notifications (
  title, message, event_type, target_role, target_user_id,
  devolucion_id, created_by, is_system, created_at
)
select
  U&'Nueva devoluci\00F3n registrada',
  U&'Se registr\00F3 la devoluci\00F3n de la factura ' ||
  coalesce(nullif(trim(d.factura), ''), 'sin referencia') ||
  U&' correspondiente al art\00EDculo ' ||
  coalesce(nullif(trim(d.articulo), ''), 'no especificado') || '.',
  'devolucion_creada',
  'admin',
  null,
  n.devolucion_id,
  n.created_by,
  true,
  n.created_at
from public.internal_notifications n
join public.devoluciones d on d.id = n.devolucion_id
where n.event_type = 'devolucion_creada'
  and n.target_role <> 'admin'
  and n.created_at >= now() - interval '7 days'
on conflict do nothing;

commit;