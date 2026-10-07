# Testing y verificacion

## Estrategia

DDevoluciones combina pruebas locales y verificaciones contra una instancia Supabase de demostracion.

Las pruebas locales validan contratos de codigo.

Las verificaciones remotas validan el comportamiento efectivo de Auth, RLS, RPC y Storage.

## Validacion local

### TypeScript

```bash
npm run typecheck
```

Ejecuta `tsc --noEmit`.

### ESLint

```bash
npm run lint
```

### Tests

```bash
npm test
```

En la auditoria final:

```text
12 test files passed
43 tests passed
```

Las pruebas incluyen contratos de:

- autenticacion;
- roles;
- permisos;
- dominio de devoluciones;
- dominio de reportes de carga;
- navegacion;
- UI/UX;
- notificaciones;
- dashboard;
- migraciones administrativas.

### Dependencias

```bash
npm audit --omit=dev --audit-level=high
```

Resultado de la auditoria final:

```text
0 vulnerabilities
```

### Build

```bash
npm run build
```

El build de produccion debe completarse sin errores de TypeScript ni compilacion.

## Verificaciones remotas

Estas pruebas requieren una instancia demo configurada y los siete usuarios de prueba.

La contraseña se proporciona por variable de entorno y no debe almacenarse en Git.

### Login y roles

```bash
npm run verify:demo-login
```

La ultima ejecucion confirmo 7/7 usuarios demo.

### Flujo de Devoluciones

```bash
npm run verify:devoluciones
```

Verifica:

- Pesado bueno;
- Pesado malo;
- Pesado mixto;
- Almacen bueno;
- Almacen malo;
- Almacen mixto;
- cierre de padres;
- RLS;
- operaciones fuera de rol;
- hard-delete administrativo.

### Reporte de carga

```bash
npm run verify:reportes-carga
```

Verifica:

- carga de evidencia;
- creacion;
- historial;
- estado pendiente de redespacho;
- notificaciones;
- lectura individual;
- redespacho;
- restricciones de rol;
- analitica;
- soft-delete administrativo.

### Matriz de seguridad

```bash
npm run verify:security
```

Verifica:

- Profile IDOR;
- autoescalamiento de rol;
- cambio de estado por no-admin;
- escrituras directas;
- matriz de RPC;
- cross-flow IDOR;
- aislamiento Storage;
- limpieza de uploads no referenciados;
- inmutabilidad de evidencia referenciada.

## Criterio de publicacion

Antes de publicar cambios deben pasar como minimo:

```bash
npm run typecheck
npm run lint
npm test
npm audit --omit=dev --audit-level=high
npm run build
```

Los cambios de autorizacion, RLS, RPC o Storage deben incluir ademas las verificaciones remotas correspondientes.
