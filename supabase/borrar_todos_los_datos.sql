-- ============================================================
-- EscabiARG — BORRAR TODOS LOS DATOS (dejar la app en 0)
--
-- ⚠️  NO SE PUEDE DESHACER. Borra:
--     · todas las cuentas (email, Google e invitados) y sus sesiones
--     · perfiles, amigos, viajes/previas y todo lo de adentro
--       (tragos, fotos cargadas, votos, misiones, duelos, casino, prendas…)
--     · avisos y celulares suscriptos a notificaciones
-- NO borra: las tablas, las funciones, los permisos ni los catálogos
-- (misiones y cartas de la ruleta). La app queda como recién instalada.
--
-- Las FOTOS, VIDEOS y FOTOS DE PERFIL (los archivos) se borran aparte, desde
-- Storage (ver DEPLOY.md → "Empezar de cero"): Supabase no deja borrar
-- archivos con SQL.
--
-- Uso: Supabase > SQL Editor > New query > pegar todo > Run.
-- ============================================================

begin;

-- Sin avisos en vivo ni notificaciones mientras se borra
select set_config('escabiarg.silent', 'on', true);

-- Viajes y todo lo de adentro
delete from public.trips;

-- Cuentas (con sus sesiones); arrastra perfiles, amigos, avisos y suscripciones
delete from auth.users;

-- Por si quedó algún perfil suelto
delete from public.profiles;

commit;

-- Cómo quedó (todo tiene que dar 0, salvo los catálogos)
select 'cuentas' as que, count(*) from auth.users
union all select 'perfiles', count(*) from public.profiles
union all select 'viajes', count(*) from public.trips
union all select 'eventos', count(*) from public.trip_events
union all select 'avisos', count(*) from public.notifications
union all select 'catálogo de misiones (se conserva)', count(*) from public.mission_catalog
union all select 'catálogo de cartas (se conserva)', count(*) from public.card_catalog;
