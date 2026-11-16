-- EscabiARG: ¿qué migraciones están corridas en esta base?
-- Pegalo en Supabase > SQL Editor > Run. Solo lee, no cambia nada.
-- Las que digan "FALTA" hay que correrlas EN ORDEN (de arriba para abajo).
select orden, archivo, case when ok then '✅ corrida' else '❌ FALTA' end as estado
from (values
  (1,  '20261104000000_amigos_y_viajes.sql',          to_regclass('public.trips') is not null),
  (2,  '20261105000000_juego_del_viaje.sql',          to_regclass('public.trip_events') is not null),
  (3,  '20261106000000_validaciones_y_votaciones.sql', to_regclass('public.event_votes') is not null),
  (4,  '20261107000000_prendas_ruleta_casino.sql',    to_regclass('public.casino_sessions') is not null),
  (5,  '20261108000000_duelos.sql',                   to_regclass('public.duels') is not null),
  (6,  '20261109000000_previa_y_salida.sql',          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'trips' and column_name = 'kind')),
  (7,  '20261110000000_tiempo_real.sql',              to_regproc('public.get_trip_state') is not null),
  (8,  '20261111000000_quemar.sql',                   to_regproc('public.burn_player') is not null),
  (9,  '20261112000000_viajes_y_boliche.sql',         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'trips' and column_name = 'boliche_at')),
  (10, '20261116000000_prenda_elegida.sql',           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'trip_events' and column_name = 'forfeit_text')),
  (11, '20261117000000_videos.sql',                   exists (select 1 from storage.buckets where id = 'trip-photos' and 'video/mp4' = any (allowed_mime_types))),
  (12, '20261118000000_casino_quede_en_0.sql',        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'casino_players' and column_name = 'busted_at')),
  (13, '20261119000000_terminos.sql',                 exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'terms_version')),
  (14, '20261120000000_foto_de_perfil.sql',           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url')),
  (15, '20261121000000_notificaciones.sql',           to_regclass('public.notifications') is not null),
  (16, '20261122000000_rendimiento.sql',              to_regproc('public.trip_pulse') is not null)
) as m(orden, archivo, ok)
order by orden;
