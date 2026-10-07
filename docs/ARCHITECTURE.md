# Arquitectura

## Objetivo

DDevoluciones esta organizado para separar reglas de negocio, autorizacion, persistencia y presentacion.

La UI nunca sustituye las reglas de autorizacion del backend.

## Capas

```text
src/app
   |
src/components
   |
src/features
   |
src/domain + src/schemas
   |
src/repositories + src/services
   |
Supabase Auth / PostgreSQL / Storage
```

### `src/app`

Contiene rutas, layouts, paginas y endpoints HTTP del App Router.

Rutas principales:

```text
/login
/dashboard
/devoluciones
/reportes-carga
/usuarios
/api/notifications
```

### `src/components`

Componentes visuales reutilizables y componentes de aplicacion.

### `src/features`

Orquesta acciones y casos de uso expuestos desde la interfaz.

Las acciones sensibles vuelven a comprobar sesion y rol antes de ejecutar operaciones.

### `src/domain`

Contiene reglas de negocio que no dependen de la interfaz.

Ejemplos:

- transiciones de estados;
- reglas de materiales;
- calculos operativos;
- contratos de acceso.

### `src/schemas`

Validacion de entradas con Zod antes de enviar datos al backend.

### `src/repositories`

Centraliza consultas de lectura contra Supabase.

Las filas siguen sujetas a RLS.

### `src/services`

Servicios especializados como la gestion del bucket privado de evidencias.

### `src/lib`

Infraestructura compartida:

- cliente Supabase;
- autenticacion;
- permisos;
- notificaciones;
- utilidades de aplicacion.

## Flujo de una operacion

```text
Usuario
  |
  v
Pagina / formulario
  |
  v
Server Action
  |
  +--> validacion Zod
  |
  +--> sesion + perfil activo + rol
  |
  v
RPC / Repository / Storage
  |
  +--> grants
  +--> RLS
  +--> reglas de negocio
  |
  v
PostgreSQL / Storage
```

## Devoluciones

La devolucion contiene el estado general del proceso.

Los materiales pueden dividirse en hijos independientes:

```text
material bueno
   -> pendiente_ubicar
   -> cerrada

material malo
   -> pendiente_disposicion
   -> cerrada
```

Cuando una devolucion contiene material mixto, el padre se cierra solamente cuando todos sus materiales hijos han sido cerrados.

### Flujo Pesado

```text
registro
 -> pendiente_entrega
 -> recepcion
 -> inventario
 -> ubicacion / disposicion
 -> cerrada
```

### Flujo Almacen

```text
registro
 -> pendiente_proceso
 -> inventario
 -> ubicacion / disposicion
 -> cerrada
```

## Reporte de carga

El modulo permite documentar cargas retornadas y su posterior redespacho.

Estados operativos principales:

```text
recibido_muelle
 -> pendiente_redespacho
 -> redespachado
```

La anulacion administrativa utiliza `is_active=false` en lugar de destruir el historial operativo.

## Autorizacion

La aplicacion mantiene una unica taxonomia de siete roles:

```text
admin
devoluciones
pesado
inventario
almacen
transportes
seguridad
```

La autorizacion se aplica en varias capas:

```text
navegacion
 + server actions
 + RPC
 + grants
 + RLS
 + Storage policies
```

## Base de datos

Las migraciones versionadas se encuentran en `supabase/migrations/`.

Una instalacion nueva debe aplicar las migraciones en orden alfanumerico.

## Evidencias

Las evidencias utilizan un bucket privado llamado `devoluciones`.

Propiedades:

- privado;
- limite de 5 MB;
- JPEG;
- PNG;
- WebP.

Las rutas se separan por usuario y modulo.

Una evidencia ya asociada a un registro operativo no puede ser eliminada directamente por su uploader.

## Principios aplicados

- Separation of Concerns
- DRY
- SSOT
- SOLID
- deny by default
- least privilege
- validacion en limites de confianza
- defensa en profundidad
