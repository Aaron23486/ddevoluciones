@AGENTS.md

# Devoluciones — guía para trabajar en el repositorio

- **Qué es:** trazabilidad de devoluciones (flujos Pesado y Almacén; material bueno, malo o mixto; recepción, inventario, ubicación, disposición y cierre) y reportes de carga (retorno en muelle y redespacho). Siete roles: `admin`, `devoluciones`, `pesado`, `inventario`, `almacen`, `transportes`, `seguridad`.
- **Stack:** Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript, Tailwind 4, Supabase (Auth, PostgREST, Storage) sobre PostgreSQL 17.
- **La base es la frontera de autorización:** RLS en todas las tablas, `authenticated` solo lee, escrituras solo por RPC `SECURITY DEFINER`. El navegador nunca habla con Supabase: todo pasa por el servidor. No mover reglas de negocio a la UI ni abrir escrituras directas.
- **Cuentas:** sin registro público; se crean y gestionan con `npm run demo:setup`, `npm run users` y `npm run create-admin`. Las contraseñas solo cambian desde la terminal.
- **Migraciones:** solo hacia adelante. Nunca editar una migración ya fusionada en `main`; crear una nueva en `supabase/migrations/`.
- **Puesta en marcha local:** `npm ci` → `npm run db:up` → `npm run env:local` → `npm run demo:setup` → `npm run dev`.
- **Antes de un commit:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`; con la base local, `npm run test:integration`.
- **Idiomas:** UI, comentarios y nombres de pruebas en español; README, `docs/`, commits y PR en inglés.
- **Convenciones:** Conventional Commits; una rama y un PR por cambio; la CI (`checks`, `supply-chain`, `integration`) debe pasar antes de fusionar.
- **Nunca** versionar `.env.local`, claves secretas de Supabase ni datos reales; los datos de demostración son ficticios.
