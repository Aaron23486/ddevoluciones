# Seguridad

## Modelo

DDevoluciones utiliza defensa en profundidad.

La autorizacion no depende de ocultar botones o rutas. Una operacion sensible debe ser rechazada por el backend aunque el cliente intente invocarla directamente.

## Identidad

La autenticacion utiliza Supabase Auth.

Un usuario necesita:

```text
sesion valida
+
perfil existente
+
is_active = true
+
rol autorizado
```

Los siete roles son:

```text
admin
devoluciones
pesado
inventario
almacen
transportes
seguridad
```

## Politica de acceso

| Rol | Devoluciones | Reporte de carga | Usuarios |
|---|---|---|---|
| `admin` | Completo | Completo | Administracion |
| `devoluciones` | Registro y gestion autorizada | Sin acceso | Sin acceso |
| `pesado` | Flujo Pesado | Sin acceso | Sin acceso |
| `inventario` | Inventario y disposicion | Ver, crear y redespachar | Sin acceso |
| `almacen` | Ubicacion flujo Almacen | Sin acceso | Sin acceso |
| `transportes` | Sin acceso | Ver y crear | Sin acceso |
| `seguridad` | Sin acceso | Ver y crear | Sin acceso |

Las condiciones detalladas de cada RPC son la autoridad final.

## Row Level Security

Todas las tablas de aplicacion tienen RLS habilitado.

`anon` no dispone de CRUD directo sobre las tablas operativas.

Los usuarios autenticados pueden disponer de `SELECT` cuando la aplicacion lo necesita, pero las filas quedan filtradas por las politicas RLS.

Ejemplos:

- Pesado solo puede leer devoluciones del flujo Pesado.
- Almacen solo puede leer devoluciones del flujo Almacen.
- Transportes y Seguridad no pueden leer Devoluciones.
- Reporte de carga se limita a los roles autorizados.
- Cada usuario solo puede leer su propio perfil; Admin puede leer perfiles administrativos.

## Escrituras

Las tablas operativas no permiten `INSERT`, `UPDATE` o `DELETE` directo a `authenticated`.

Las mutaciones se realizan mediante RPC controladas.

Las RPC sensibles comprueban:

```text
auth.uid()
is_active
role
estado actual
reglas de negocio
```

Las funciones internas no necesarias para el cliente tienen `EXECUTE` revocado para:

```text
PUBLIC
anon
authenticated
```

## Escalamiento de privilegios

Se verifico que un usuario no administrador no puede:

- cambiar su rol a `admin`;
- cambiar el estado activo de perfiles;
- escribir directamente en `profiles`;
- ejecutar RPC administrativas;
- realizar hard-delete de devoluciones.

## IDOR

La matriz de seguridad prueba acceso utilizando UUID validos pertenecientes a otros flujos.

Se comprobo que:

- Pesado no puede leer devoluciones de Almacen;
- Almacen no puede leer devoluciones de Pesado;
- Transportes no puede leer Devoluciones;
- Seguridad no puede leer Devoluciones;
- la metadata de evidencias hereda el acceso del registro padre.

## Storage

Bucket: `devoluciones`

Configuracion:

```text
public = false
file_size_limit = 5 MB
MIME = image/jpeg, image/png, image/webp
```

La carga requiere usuario activo y rol autorizado.

La ruta debe comenzar por el UUID del uploader.

Las evidencias de Devoluciones y Reporte de carga se encuentran separadas logicamente mediante policies.

### Integridad de evidencias

Los usuarios pueden eliminar una carga propia que aun no haya quedado asociada a una operacion.

Esto permite limpiar archivos cuando una transaccion posterior falla.

Una vez que la ruta aparece en `devolucion_evidencias` o `reportes_carga_evidencias`, la policy impide que el uploader la elimine directamente.

Admin conserva la capacidad administrativa necesaria para los flujos controlados.

## Secretos

Variables publicas:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Variables privilegiadas de seed:

```text
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
DEMO_USERS_PASSWORD
```

Las variables privilegiadas:

- no se incluyen en `NEXT_PUBLIC_*`;
- no se guardan en el codigo;
- no deben versionarse;
- se eliminan del proceso despues de los verificadores cuando corresponde.

## Auditoria realizada

La revision de seguridad incluyo:

- permisos de tablas;
- RLS;
- metadata y permisos de RPC;
- `SECURITY DEFINER`;
- `search_path`;
- Storage;
- secretos;
- historial Git;
- escalamiento de privilegios;
- IDOR;
- separacion de modulos;
- proteccion de evidencias referenciadas.

La matriz automatizada final fue aprobada con los siete roles.
