-- EscabiARG: duelos de tragos entre jugadores del viaje (fondo blanco y shots)
-- Ejecutar DESPUÉS de 20261107000000_prendas_ruleta_casino.sql
--
-- Límites fijos para que siga siendo un juego:
--   * el retado tiene que aceptar (y puede decir que no sin costo)
--   * en el duelo de shots se cuentan hasta 3 shots
--   * cada jugador puede jugar hasta 3 duelos por jornada
--   * "Me bajo" siempre disponible; perder o bajarse no resta puntos

alter table public.trip_events drop constraint trip_events_kind_check;
alter table public.trip_events add constraint trip_events_kind_check
  check (kind in ('drink', 'mission', 'quiebre', 'card', 'infraction', 'chef', 'casino', 'forfeit', 'duel'));

alter table public.trips
  add column duel_points int not null default 15 check (duel_points between 0 and 500);

grant update (duel_points) on public.trips to authenticated;

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind text not null check (kind in ('fondo', 'shots')),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id uuid not null references public.profiles (id) on delete cascade,
  -- fondo: tiempo máximo para terminar; shots: duración de la cuenta regresiva
  seconds int not null check (seconds between 10 and 600),
  status text not null default 'invited' check (status in ('invited', 'declined', 'live', 'done', 'cancelled')),
  day date not null,
  created_at timestamptz not null default now(),
  starts_at timestamptz,
  ends_at timestamptz,
  winner_id uuid references public.profiles (id) on delete set null,
  event_id uuid references public.trip_events (id) on delete set null,
  resolved_at timestamptz,
  check (challenger_id <> opponent_id)
);

create index duels_trip_idx on public.duels (trip_id, created_at desc);

create table public.duel_results (
  duel_id uuid not null references public.duels (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  finished_at timestamptz,
  shots int not null default 0 check (shots between 0 and 3),
  last_shot_at timestamptz,
  gave_up boolean not null default false,
  primary key (duel_id, user_id)
);

-- Hora del servidor: la app la usa para sincronizar las cuentas regresivas
create or replace function public.server_time()
returns timestamptz
language sql
stable
as $$ select now() $$;

create or replace function public.format_seconds(p_interval interval)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(extract(epoch from p_interval), 'FM990.0'), '.', ',') || ' s';
$$;

create or replace function public.resolve_duel(p_duel uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels%rowtype;
  t public.trips%rowtype;
  a public.duel_results%rowtype;
  b public.duel_results%rowtype;
  winner uuid;
  loser uuid;
  w public.duel_results%rowtype;
  l public.duel_results%rowtype;
  label text;
  detail text;
  ev uuid;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found then
    return 'missing';
  end if;

  -- Invitaciones sin respuesta vencen a los 10 minutos
  if d.status = 'invited' then
    if now() >= d.created_at + interval '10 minutes' then
      update public.duels set status = 'cancelled', resolved_at = now() where id = d.id;
      return 'cancelled';
    end if;
    return 'invited';
  end if;
  if d.status <> 'live' then
    return d.status;
  end if;

  select * into a from public.duel_results where duel_id = d.id and user_id = d.challenger_id;
  select * into b from public.duel_results where duel_id = d.id and user_id = d.opponent_id;

  -- ¿Ya se puede definir?
  if now() < d.ends_at and not a.gave_up and not b.gave_up
     and not (d.kind = 'fondo' and a.finished_at is not null and b.finished_at is not null)
     and not (d.kind = 'shots' and a.shots >= 3 and b.shots >= 3) then
    return 'live';
  end if;

  if a.gave_up and not b.gave_up then
    winner := b.user_id;
  elsif b.gave_up and not a.gave_up then
    winner := a.user_id;
  elsif d.kind = 'fondo' then
    if a.finished_at is not null and not a.gave_up
       and (b.finished_at is null or b.gave_up or a.finished_at <= b.finished_at) then
      winner := a.user_id;
    elsif b.finished_at is not null and not b.gave_up then
      winner := b.user_id;
    end if;
  else
    if a.shots > b.shots or (a.shots = b.shots and a.shots > 0 and a.last_shot_at <= b.last_shot_at) then
      winner := a.user_id;
    elsif b.shots > a.shots or (a.shots = b.shots and b.shots > 0) then
      winner := b.user_id;
    end if;
  end if;

  if winner is not null then
    loser := case when winner = d.challenger_id then d.opponent_id else d.challenger_id end;
    select * into w from public.duel_results where duel_id = d.id and user_id = winner;
    select * into l from public.duel_results where duel_id = d.id and user_id = loser;
    select * into t from public.trips where id = d.trip_id;

    if d.kind = 'fondo' then
      label := 'Ganó el duelo de fondo blanco';
      detail := 'Terminó en ' || public.format_seconds(w.finished_at - d.starts_at)
        || case when l.gave_up then ' · el otro se bajó'
                when l.finished_at is null then ' · el otro no llegó'
                else ' · el otro tardó ' || public.format_seconds(l.finished_at - d.starts_at) end;
    else
      label := 'Ganó el duelo de shots';
      detail := w.shots || ' a ' || l.shots || case when l.gave_up then ' · el otro se bajó' else '' end;
    end if;

    -- user = ganador, actor = perdedor: validan los demás del viaje
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, status, ref_id)
    values (d.trip_id, winner, loser, 'duel', t.duel_points, d.day, label, '⚔️', detail, 'pending', d.id)
    returning id into ev;
    perform public.resolve_event(ev);
  end if;

  update public.duels set status = 'done', winner_id = winner, event_id = ev, resolved_at = now() where id = d.id;
  return 'done';
end;
$$;

create or replace function public.challenge_duel(p_trip uuid, p_opponent uuid, p_kind text, p_seconds int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  today date := public.trip_day_for(p_trip);
  new_id uuid;
begin
  if not public.is_trip_member(p_trip, p_opponent) or p_opponent = me then
    raise exception 'INVALID_OPPONENT';
  end if;
  if p_kind not in ('fondo', 'shots') then
    raise exception 'INVALID_KIND';
  end if;
  if p_kind = 'fondo' and (p_seconds < 10 or p_seconds > 120) then
    raise exception 'INVALID_SECONDS';
  end if;
  if p_kind = 'shots' and (p_seconds < 30 or p_seconds > 300) then
    raise exception 'INVALID_SECONDS';
  end if;

  perform public.tick_trip(p_trip);

  if exists (
    select 1 from public.duels
    where trip_id = p_trip and status in ('invited', 'live')
      and (challenger_id in (me, p_opponent) or opponent_id in (me, p_opponent))
  ) then
    raise exception 'DUEL_BUSY';
  end if;

  if (select count(*) from public.duels
      where trip_id = p_trip and day = today and status in ('live', 'done')
        and (challenger_id = me or opponent_id = me)) >= 3 then
    raise exception 'DUEL_LIMIT_ME';
  end if;
  if (select count(*) from public.duels
      where trip_id = p_trip and day = today and status in ('live', 'done')
        and (challenger_id = p_opponent or opponent_id = p_opponent)) >= 3 then
    raise exception 'DUEL_LIMIT_OPPONENT';
  end if;

  insert into public.duels (trip_id, kind, challenger_id, opponent_id, seconds, day)
  values (p_trip, p_kind, me, p_opponent, p_seconds, today)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.respond_duel(p_duel uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels%rowtype;
  me uuid;
begin
  perform public.resolve_duel(p_duel);
  select * into d from public.duels where id = p_duel for update;
  if not found then
    raise exception 'DUEL_NOT_FOUND';
  end if;
  me := public.require_trip_member(d.trip_id);
  if me <> d.opponent_id then
    raise exception 'NOT_ALLOWED';
  end if;
  if d.status <> 'invited' then
    raise exception 'DUEL_CLOSED';
  end if;

  if not p_accept then
    update public.duels set status = 'declined', resolved_at = now() where id = d.id;
    return 'declined';
  end if;

  if (select count(*) from public.duels
      where trip_id = d.trip_id and day = d.day and status in ('live', 'done')
        and (challenger_id = me or opponent_id = me)) >= 3 then
    raise exception 'DUEL_LIMIT_ME';
  end if;

  -- 5 segundos para que los dos vean la cuenta regresiva
  update public.duels
  set status = 'live', starts_at = now() + interval '5 seconds',
      ends_at = now() + interval '5 seconds' + make_interval(secs => d.seconds)
  where id = d.id;
  insert into public.duel_results (duel_id, trip_id, user_id) values
    (d.id, d.trip_id, d.challenger_id), (d.id, d.trip_id, d.opponent_id);
  return 'live';
end;
$$;

-- Acciones durante el duelo
create or replace function public.duel_action(p_duel uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels%rowtype;
  r public.duel_results%rowtype;
  me uuid;
begin
  perform public.resolve_duel(p_duel);
  select * into d from public.duels where id = p_duel;
  if not found then
    raise exception 'DUEL_NOT_FOUND';
  end if;
  me := public.require_trip_member(d.trip_id);
  select * into r from public.duel_results where duel_id = d.id and user_id = me for update;
  if not found then
    raise exception 'NOT_ALLOWED';
  end if;
  if d.status <> 'live' then
    raise exception 'DUEL_CLOSED';
  end if;
  if r.gave_up or r.finished_at is not null then
    raise exception 'DUEL_ALREADY_DONE';
  end if;

  if p_action = 'give_up' then
    update public.duel_results set gave_up = true where duel_id = d.id and user_id = me;
  else
    if now() < d.starts_at then
      raise exception 'DUEL_FALSE_START';
    end if;
    if p_action = 'finish' and d.kind = 'fondo' then
      update public.duel_results set finished_at = now() where duel_id = d.id and user_id = me;
    elsif p_action = 'shot' and d.kind = 'shots' then
      if r.shots >= 3 then
        raise exception 'DUEL_SHOTS_CAP';
      end if;
      update public.duel_results set shots = shots + 1, last_shot_at = now() where duel_id = d.id and user_id = me;
    else
      raise exception 'INVALID_KIND';
    end if;
  end if;

  return public.resolve_duel(d.id);
end;
$$;

create or replace function public.cancel_duel(p_duel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels%rowtype;
  me uuid;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found then
    raise exception 'DUEL_NOT_FOUND';
  end if;
  me := public.require_trip_member(d.trip_id);
  if me <> d.challenger_id or d.status <> 'invited' then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.duels set status = 'cancelled', resolved_at = now() where id = d.id;
end;
$$;

-- tick_trip también cierra duelos vencidos
create or replace function public.tick_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  perform public.require_trip_member(p_trip);
  for cid in
    select id from public.mission_challenges
    where trip_id = p_trip and phase in ('vote_bad', 'proposals', 'vote_option')
  loop
    perform public.resolve_challenge(cid);
  end loop;
  for cid in
    select id from public.casino_sessions where trip_id = p_trip and status in ('running', 'reporting')
  loop
    perform public.resolve_casino(cid);
  end loop;
  for cid in
    select id from public.duels where trip_id = p_trip and status in ('invited', 'live')
  loop
    perform public.resolve_duel(cid);
  end loop;
end;
$$;

-- Pendientes: se suman las invitaciones a duelos
create or replace function public.my_pending()
returns table (trip_id uuid, pending bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  my_trips as (
    select m.trip_id from public.trip_members m, me where m.user_id = me.id
  ),
  items as (
    select e.trip_id from public.trip_events e, me
    where e.trip_id in (select trip_id from my_trips)
      and e.status = 'pending' and e.actor_id <> me.id and e.user_id <> me.id
      and not exists (select 1 from public.event_votes v where v.event_id = e.id and v.voter_id = me.id)
    union all
    select c.trip_id from public.mission_challenges c, me
    where c.trip_id in (select trip_id from my_trips) and c.target_user_id <> me.id
      and (
        (c.phase = 'vote_bad' and c.bad_until > now()
          and not exists (select 1 from public.challenge_bad_votes v where v.challenge_id = c.id and v.voter_id = me.id))
        or (c.phase = 'proposals' and c.proposals_until > now()
          and not exists (select 1 from public.challenge_options o where o.challenge_id = c.id and o.author_id = me.id))
        or (c.phase = 'vote_option' and c.voting_until > now()
          and not exists (select 1 from public.challenge_option_votes v where v.challenge_id = c.id and v.voter_id = me.id)
          and exists (select 1 from public.challenge_options o where o.challenge_id = c.id and o.author_id <> me.id))
      )
    union all
    select s.trip_id from public.chef_spins s, me
    where s.trip_id in (select trip_id from my_trips)
      and (
        (s.status = 'joining'
          and not exists (select 1 from public.chef_spin_players p where p.spin_id = s.id and p.user_id = me.id))
        or (s.status = 'voting' and s.chosen_user_id <> me.id
          and not exists (select 1 from public.chef_votes v where v.spin_id = s.id and v.voter_id = me.id))
      )
    union all
    select c.trip_id from public.casino_sessions c
    join public.casino_players p on p.session_id = c.id, me
    where p.user_id = me.id and p.reported_at is null
      and (c.status = 'reporting' or (c.status = 'running' and c.ends_at <= now()))
      and c.report_until > now()
    union all
    select f.trip_id from public.player_forfeits f, me
    where f.trip_id in (select trip_id from my_trips) and f.user_id = me.id and f.status = 'to_do'
    union all
    select d.trip_id from public.duels d, me
    where d.opponent_id = me.id and d.status = 'invited' and d.created_at > now() - interval '10 minutes'
  )
  select trip_id, count(*) from items group by trip_id;
$$;

alter table public.duels enable row level security;
alter table public.duel_results enable row level security;

revoke all on public.duels, public.duel_results from anon, authenticated;
grant select on public.duels, public.duel_results to authenticated;

create policy "Ver duelos de mis viajes" on public.duels for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver resultados de duelos" on public.duel_results for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

revoke execute on function
  public.format_seconds(interval),
  public.resolve_duel(uuid),
  public.challenge_duel(uuid, uuid, text, int),
  public.respond_duel(uuid, boolean),
  public.duel_action(uuid, text),
  public.cancel_duel(uuid),
  public.tick_trip(uuid),
  public.my_pending()
from public, anon, authenticated;

grant execute on function
  public.server_time(),
  public.challenge_duel(uuid, uuid, text, int),
  public.respond_duel(uuid, boolean),
  public.duel_action(uuid, text),
  public.cancel_duel(uuid),
  public.tick_trip(uuid),
  public.my_pending()
to authenticated;
