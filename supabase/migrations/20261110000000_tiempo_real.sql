-- EscabiARG: tiempo real y lectura del viaje en un solo pedido
--
-- 1. get_trip_state(): todo el estado del viaje en una sola llamada (antes eran 22).
-- 2. Cada cambio en las tablas del viaje se avisa por Supabase Realtime (Broadcast
--    desde la base) al canal privado "trip:<id>". La app aplica el cambio al instante,
--    sin volver a pedir todo. Amigos e invitaciones a viajes van a "user:<id>".
-- 3. Solo pueden escuchar un canal los miembros del viaje (o el propio usuario).
-- 4. tick_trip() ahora solo toca lo vencido (votaciones, casinos y duelos), así no
--    bloquea filas en cada lectura.
-- 5. Índices que faltaban para leer por viaje.
--
-- Si Realtime no está disponible la app sigue andando: vuelve a refrescar sola cada
-- tantos segundos, como antes.

-- ============================================================
-- Índices
-- ============================================================

create index if not exists chef_spin_players_trip_idx on public.chef_spin_players (trip_id);
create index if not exists chef_votes_trip_idx on public.chef_votes (trip_id);
create index if not exists casino_players_trip_idx on public.casino_players (trip_id);
create index if not exists duel_results_trip_idx on public.duel_results (trip_id);

-- Lo que todavía está en juego (lo que revisa tick y la lista de pendientes)
create index if not exists mission_challenges_open_idx on public.mission_challenges (trip_id)
  where phase in ('vote_bad', 'proposals', 'vote_option');
create index if not exists casino_sessions_open_idx on public.casino_sessions (trip_id)
  where status in ('running', 'reporting');
create index if not exists duels_open_idx on public.duels (trip_id)
  where status in ('invited', 'live');
create index if not exists duels_invited_opponent_idx on public.duels (opponent_id)
  where status = 'invited';
create index if not exists chef_spins_open_idx on public.chef_spins (trip_id)
  where status in ('joining', 'voting');
create index if not exists player_forfeits_todo_idx on public.player_forfeits (user_id)
  where status = 'to_do';

-- ============================================================
-- Cierre de lo vencido
-- ============================================================

-- Resuelve solo lo que ya pasó su hora. Lo que se define por votos ya se resuelve
-- en el momento del voto; acá queda lo que depende del reloj.
create or replace function public.resolve_due(p_trip uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  n int := 0;
begin
  for cid in
    select id from public.mission_challenges
    where trip_id = p_trip
      and (
        (phase = 'vote_bad' and bad_until <= now())
        or (phase = 'proposals' and proposals_until <= now())
        or (phase = 'vote_option' and voting_until <= now())
      )
  loop
    perform public.resolve_challenge(cid);
    n := n + 1;
  end loop;

  for cid in
    select id from public.casino_sessions
    where trip_id = p_trip
      and (
        (status = 'running' and ends_at <= now())
        or (status = 'reporting' and report_until <= now())
      )
  loop
    perform public.resolve_casino(cid);
    n := n + 1;
  end loop;

  for cid in
    select id from public.duels
    where trip_id = p_trip
      and (
        (status = 'invited' and created_at + interval '10 minutes' <= now())
        or (status = 'live' and ends_at <= now())
      )
  loop
    perform public.resolve_duel(cid);
    n := n + 1;
  end loop;

  return n;
end;
$$;

create or replace function public.tick_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_trip_member(p_trip);
  perform public.resolve_due(p_trip);
end;
$$;

-- ============================================================
-- Todo el viaje en un solo pedido
-- ============================================================

create or replace function public.get_trip_state(p_trip uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_trip_member(p_trip);
  perform public.resolve_due(p_trip);

  select jsonb_build_object(
    'trip', (
      select to_jsonb(t) || jsonb_build_object(
        'members', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'user_id', m.user_id,
              'role', m.role,
              'profile', case when p.id is null then null
                              else jsonb_build_object('id', p.id, 'display_name', p.display_name) end
            )
            order by m.added_at, m.user_id
          )
          from public.trip_members m
          left join public.profiles p on p.id = m.user_id
          where m.trip_id = t.id
        ), '[]'::jsonb)
      )
      from public.trips t where t.id = p_trip
    ),
    'drinks', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.points, x.created_at)
      from public.trip_drinks x where x.trip_id = p_trip and not x.archived
    ), '[]'::jsonb),
    -- La actividad es lo que más crece: se mandan solo las columnas que usa la app
    'events', coalesce((
      select jsonb_agg(
        to_jsonb(x) - 'trip_id' - 'drink_id' - 'card_id' - 'resolved_at'
        order by x.created_at desc
      )
      from public.trip_events x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'missions', coalesce((
      select jsonb_agg(to_jsonb(x)) from public.daily_missions x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.player_cards x where x.trip_id = p_trip
    ), '[]'::jsonb),
    -- Los votos solo hacen falta mientras la foto está por validarse
    'eventVotes', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', x.event_id, 'voter_id', x.voter_id, 'valid', x.valid))
      from public.event_votes x
      join public.trip_events e on e.id = x.event_id and e.status = 'pending'
      where x.trip_id = p_trip
    ), '[]'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from public.mission_challenges x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'badVotes', coalesce((
      select jsonb_agg(to_jsonb(x)) from public.challenge_bad_votes x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.challenge_options x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'optionVotes', coalesce((
      select jsonb_agg(to_jsonb(x)) from public.challenge_option_votes x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'infractions', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.trip_infractions x where x.trip_id = p_trip and not x.archived
    ), '[]'::jsonb),
    'forfeits', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.trip_forfeits x where x.trip_id = p_trip and not x.archived
    ), '[]'::jsonb),
    'playerForfeits', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from public.player_forfeits x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'chefSpins', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select * from public.chef_spins where trip_id = p_trip order by created_at desc limit 20
      ) x
    ), '[]'::jsonb),
    'chefPlayers', coalesce((
      select jsonb_agg(to_jsonb(x)) from public.chef_spin_players x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'chefVotes', coalesce((
      select jsonb_agg(to_jsonb(x)) from public.chef_votes x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'casinoSessions', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select * from public.casino_sessions where trip_id = p_trip order by created_at desc limit 10
      ) x
    ), '[]'::jsonb),
    'casinoPlayers', coalesce((
      select jsonb_agg(to_jsonb(x)) from public.casino_players x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'duels', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select * from public.duels where trip_id = p_trip order by created_at desc limit 30
      ) x
    ), '[]'::jsonb),
    'duelResults', coalesce((
      select jsonb_agg(to_jsonb(x)) from public.duel_results x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'serverTime', to_jsonb(clock_timestamp())
  ) into result;

  return result;
end;
$$;

-- ============================================================
-- Avisos en tiempo real (Supabase Realtime: Broadcast desde la base)
-- ============================================================

-- Manda un mensaje a un canal privado. Si Realtime no está o falla, no rompe la jugada.
create or replace function public.rt_send(p_topic text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(p_payload, 'change', p_topic, true);
exception when others then
  raise warning 'EscabiARG realtime: %', sqlerrm;
end;
$$;

-- Cualquier cambio en una tabla del viaje: se manda la fila completa
create or replace function public.broadcast_trip_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_trip text := case when tg_table_name = 'trips' then v_row ->> 'id' else v_row ->> 'trip_id' end;
begin
  if v_trip is not null then
    perform public.rt_send(
      'trip:' || v_trip,
      jsonb_build_object('t', tg_table_name, 'op', tg_op, 'row', v_row)
    );
  end if;
  return null;
end;
$$;

-- Entran o salen miembros: avisa al viaje y a la persona (para que le aparezca en el inicio)
create or replace function public.broadcast_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_payload jsonb := jsonb_build_object('t', 'trip_members', 'op', tg_op, 'row', v_row);
begin
  perform public.rt_send('trip:' || (v_row ->> 'trip_id'), v_payload);
  perform public.rt_send('user:' || (v_row ->> 'user_id'), v_payload);
  return null;
end;
$$;

-- Te agregan (o te sacan) como amigo
create or replace function public.broadcast_friend_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  perform public.rt_send(
    'user:' || (v_row ->> 'user_id'),
    jsonb_build_object('t', 'friendships', 'op', tg_op, 'row', v_row)
  );
  return null;
end;
$$;

-- Alguien se cambia el nombre: lo ven sus viajes y sus amigos
create or replace function public.broadcast_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_friend uuid;
  v_payload jsonb;
begin
  if new.display_name is not distinct from old.display_name then
    return null;
  end if;
  for v_trip in select trip_id from public.trip_members where user_id = new.id loop
    perform public.rt_send(
      'trip:' || v_trip,
      jsonb_build_object('t', 'trip_members', 'op', 'UPDATE',
                         'row', jsonb_build_object('trip_id', v_trip, 'user_id', new.id))
    );
  end loop;
  v_payload := jsonb_build_object('t', 'friendships', 'op', 'UPDATE',
                                  'row', jsonb_build_object('friend_id', new.id));
  for v_friend in select user_id from public.friendships where friend_id = new.id loop
    perform public.rt_send('user:' || v_friend, v_payload);
  end loop;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'trip_drinks', 'trip_events', 'daily_missions', 'player_cards', 'event_votes',
    'mission_challenges', 'challenge_bad_votes', 'challenge_options', 'challenge_option_votes',
    'trip_infractions', 'trip_forfeits', 'player_forfeits', 'chef_spins', 'chef_spin_players',
    'chef_votes', 'casino_sessions', 'casino_players', 'duels', 'duel_results'
  ] loop
    execute format('drop trigger if exists broadcast_change on public.%I', t);
    execute format(
      'create trigger broadcast_change after insert or update or delete on public.%I
         for each row execute function public.broadcast_trip_change()', t);
  end loop;
end;
$$;

drop trigger if exists broadcast_change on public.trips;
create trigger broadcast_change
  after update or delete on public.trips
  for each row execute function public.broadcast_trip_change();

drop trigger if exists broadcast_change on public.trip_members;
create trigger broadcast_change
  after insert or update or delete on public.trip_members
  for each row execute function public.broadcast_member_change();

drop trigger if exists broadcast_change on public.friendships;
create trigger broadcast_change
  after insert or delete on public.friendships
  for each row execute function public.broadcast_friend_change();

drop trigger if exists broadcast_change on public.profiles;
create trigger broadcast_change
  after update on public.profiles
  for each row execute function public.broadcast_profile_change();

-- ¿Puede el usuario actual escuchar este canal?
create or replace function public.can_listen_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or p_topic is null then false
    when p_topic ~ '^trip:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_trip_member(substr(p_topic, 6)::uuid, (select auth.uid()))
    when p_topic like 'user:%'
      then substr(p_topic, 6) = (select auth.uid())::text
    else false
  end;
$$;

-- Permiso para recibir mensajes en los canales privados (solo lectura: nadie puede
-- mandar mensajes desde la app, solo la base)
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "EscabiARG: escuchar mis viajes" on realtime.messages';
    execute $policy$
      create policy "EscabiARG: escuchar mis viajes" on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and public.can_listen_topic((select realtime.topic()))
        )
    $policy$;
  else
    raise notice 'No existe realtime.messages: la app va a refrescar sin tiempo real.';
  end if;
end;
$$;

-- ============================================================
-- Permisos
-- ============================================================

revoke execute on function
  public.resolve_due(uuid),
  public.tick_trip(uuid),
  public.get_trip_state(uuid),
  public.rt_send(text, jsonb),
  public.broadcast_trip_change(),
  public.broadcast_member_change(),
  public.broadcast_friend_change(),
  public.broadcast_profile_change(),
  public.can_listen_topic(text)
from public, anon, authenticated;

grant execute on function
  public.tick_trip(uuid),
  public.get_trip_state(uuid),
  public.can_listen_topic(text)
to authenticated;
