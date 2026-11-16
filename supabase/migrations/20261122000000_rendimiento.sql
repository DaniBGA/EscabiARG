-- EscabiARG: rendimiento con muchos jugadores a la vez
--
-- Prueba de carga (12 jugadores jugando a la vez): el tiempo real de Supabase
-- tiene un límite de mensajes por segundo para todo el proyecto (100/s en el
-- plan gratis). Los avisos se mandaban uno por persona (un "¡Votá!" en una sala
-- de 12 eran 10 mensajes) y eran el 74 % del total: al pasar el límite, Supabase
-- descarta los mensajes y los celulares dejan de actualizarse.
--
--  1. Los avisos para varios jugadores de una sala van en UN solo mensaje a la
--     sala, con la lista de a quiénes les toca.
--  2. trip_pulse: hora del último cambio de la sala (respuesta mínima). La app
--     la consulta cada tanto para darse cuenta si se perdió algo en vivo.
--  3. Limpieza de avisos viejos aunque no esté instalada la función push.

-- ---------- 1. Un mensaje por aviso, no uno por persona ----------

drop trigger if exists broadcast_change on public.notifications;
drop function if exists public.broadcast_notification();

create or replace function public.broadcast_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  u uuid;
begin
  for r in
    select trip_id, title, body, tag, url, min(id) as id, array_agg(user_id order by id) as users
    from new_rows
    group by trip_id, title, body, tag, url
  loop
    if r.trip_id is not null and cardinality(r.users) > 1 then
      perform public.rt_send('trip:' || r.trip_id, jsonb_build_object(
        't', 'notifications', 'op', 'INSERT',
        'row', jsonb_build_object('id', r.id, 'trip_id', r.trip_id, 'title', r.title, 'body', r.body,
                                  'tag', r.tag, 'url', r.url, 'users', to_jsonb(r.users))
      ));
    else
      foreach u in array r.users loop
        perform public.rt_send('user:' || u, jsonb_build_object(
          't', 'notifications', 'op', 'INSERT',
          'row', jsonb_build_object('id', r.id, 'trip_id', r.trip_id, 'title', r.title, 'body', r.body,
                                    'tag', r.tag, 'url', r.url, 'users', jsonb_build_array(u))
        ));
      end loop;
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.broadcast_notifications() from public, anon, authenticated;

create trigger broadcast_change
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.broadcast_notifications();

-- ---------- 2. Pulso de la sala ----------

create or replace function public.trip_pulse(p_trip uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_trip_member(p_trip, me) then
    raise exception 'NOT_TRIP_MEMBER';
  end if;
  return greatest(
    (select greatest(max(created_at), max(resolved_at)) from public.trip_events where trip_id = p_trip),
    (select max(created_at) from public.event_votes where trip_id = p_trip),
    (select greatest(max(created_at), max(starts_at), max(resolved_at)) from public.duels where trip_id = p_trip),
    (select greatest(max(created_at), max(completed_at)) from public.daily_missions where trip_id = p_trip),
    (select greatest(max(created_at), max(spun_at), max(voting_at), max(resolved_at)) from public.chef_spins where trip_id = p_trip),
    (select greatest(max(created_at), max(resolved_at)) from public.casino_sessions where trip_id = p_trip),
    (select greatest(max(joined_at), max(reported_at), max(busted_at)) from public.casino_players where trip_id = p_trip),
    (select greatest(max(created_at), max(done_at)) from public.player_forfeits where trip_id = p_trip),
    (select greatest(max(created_at), max(resolved_at)) from public.mission_challenges where trip_id = p_trip)
  );
end;
$$;

revoke execute on function public.trip_pulse(uuid) from public, anon, authenticated;
grant execute on function public.trip_pulse(uuid) to authenticated;

-- Índices para que el pulso no tenga que recorrer tablas enteras
create index if not exists daily_missions_trip_idx on public.daily_missions (trip_id);
create index if not exists casino_players_trip_idx on public.casino_players (trip_id);

-- ---------- 3. Limpieza de avisos ----------

create or replace function public.notify_users(p_users uuid[], p_trip uuid, p_body text, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if current_setting('escabiarg.silent', true) = 'on' or p_users is null or cardinality(p_users) = 0 then
    return;
  end if;
  select name into v_title from public.trips where id = p_trip;
  if v_title is null then
    return;
  end if;
  insert into public.notifications (user_id, trip_id, title, body, tag, url)
  select distinct u, p_trip, v_title, left(p_body, 240), left(p_tag, 120), '#/viaje/' || p_trip
  from unnest(p_users) as u
  where u is not null;
  -- De vez en cuando se borran los de hace más de 3 días (por si nadie los manda por push)
  if random() < 0.01 then
    delete from public.notifications where created_at < now() - interval '3 days';
  end if;
end;
$$;

revoke execute on function public.notify_users(uuid[], uuid, text, text) from public, anon, authenticated;

-- ---------- 4. Crear una sala sin ráfaga de mensajes ----------
-- Al crear el viaje se cargan ~40 prendas e infracciones sugeridas. Nadie está
-- mirando esa sala todavía, así que no hace falta avisar fila por fila (era el
-- pico más alto de la prueba: 105 mensajes en un segundo).

create or replace function public.seed_trip_lists_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was text := coalesce(current_setting('escabiarg.silent', true), '');
begin
  perform set_config('escabiarg.silent', 'on', true);
  perform public.seed_trip_lists(new.id);
  perform public.seed_boliche_lists(new.id);
  perform set_config('escabiarg.silent', was, true);
  return new;
end;
$$;
