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
