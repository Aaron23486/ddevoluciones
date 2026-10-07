-- DDEVOLUCIONES - CONFIGURAR ROLES DEMO
-- EJECUTAR MANUALMENTE EN SUPABASE SQL EDITOR, SOLO EN UNA BASE DE PRUEBAS.
-- ANTES: crear las 7 cuentas en Authentication > Users.
-- Sustituir TODOS los emails CAMBIAR_... por direcciones existentes en auth.users.
-- NO crear contrasenas ni insertar manualmente en auth.users.
-- NO ejecutar en una base de produccion.

begin;

create temporary table demo_setup_roles (
  email text primary key,
  full_name text not null,
  role public.app_role not null
) on commit drop;

insert into demo_setup_roles (email, full_name, role) values
  ('CAMBIAR_ADMIN@example.invalid', 'Admin demo', 'admin'),
  ('CAMBIAR_DEVOLUCIONES@example.invalid', 'Devoluciones demo', 'devoluciones'),
  ('CAMBIAR_PESADO@example.invalid', 'Pesado demo', 'pesado'),
  ('CAMBIAR_INVENTARIO@example.invalid', 'Inventario demo', 'inventario'),
  ('CAMBIAR_ALMACEN@example.invalid', 'Almacen demo', 'almacen'),
  ('CAMBIAR_TRANSPORTES@example.invalid', 'Transportes demo', 'transportes'),
  ('CAMBIAR_SEGURIDAD@example.invalid', 'Seguridad demo', 'seguridad');

do $$
begin
  if exists (select 1 from demo_setup_roles where email ilike 'CAMBIAR_%') then
    raise exception 'Primero reemplaza todos los correos CAMBIAR_...';
  end if;

  if exists (
    select 1 from demo_setup_roles d
    where not exists (
      select 1 from auth.users u where lower(u.email) = lower(d.email)
    )
  ) then
    raise exception 'Uno o mas correos no existen en Authentication > Users.';
  end if;
end;
$$;

insert into public.profiles (id, email, full_name, role, is_active)
select u.id, lower(u.email), d.full_name, d.role, true
from demo_setup_roles d
join auth.users u on lower(u.email) = lower(d.email)
on conflict (id) do update set
  role = excluded.role,
  is_active = excluded.is_active,
  full_name = excluded.full_name;

commit;

-- Verificacion manual opcional (no revela credenciales):
-- select email, role, is_active from public.profiles order by role;