-- EscabiARG: validación de fotos entre jugadores, hora de fin de jornada
-- elegida por el organizador, misiones argentinas y votación de misiones.
-- Ejecutar DESPUÉS de 20261105000000_juego_del_viaje.sql

-- ============================================================
-- Fin de la jornada (lo elige el organizador)
-- ============================================================

alter table public.trips
  add column day_cutoff_hour int not null default 6 check (day_cutoff_hour between 0 and 23);

grant update (day_cutoff_hour) on public.trips to authenticated;

create or replace function public.trip_day_for(p_trip uuid, ts timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (ts at time zone 'America/Argentina/Buenos_Aires')
    - make_interval(hours => coalesce((select day_cutoff_hour from public.trips where id = p_trip), 6))
  )::date;
$$;

-- ============================================================
-- Validación de tragos y quiebres
-- ============================================================

alter table public.trip_events
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column resolved_at timestamptz;

create index trip_events_pending_idx on public.trip_events (trip_id) where status = 'pending';

create table public.event_votes (
  event_id uuid not null references public.trip_events (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  valid boolean not null,
  created_at timestamptz not null default now(),
  primary key (event_id, voter_id)
);

create index event_votes_trip_idx on public.event_votes (trip_id);

-- Aprueba o rechaza según los votos. Votan todos menos quien lo cargó y a quien afecta.
-- Aprobado: más de la mitad dice que vale. Rechazado: ya no se puede llegar a esa mayoría.
create or replace function public.resolve_event(p_event uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.trip_events%rowtype;
  eligible int;
  yes int;
  no int;
  shield uuid;
begin
  select * into e from public.trip_events where id = p_event for update;
  if not found or e.status <> 'pending' then
    return coalesce(e.status, 'missing');
  end if;

  select count(*) into eligible
  from public.trip_members m
  where m.trip_id = e.trip_id and m.user_id <> e.actor_id and m.user_id <> e.user_id;

  select count(*) filter (where valid), count(*) filter (where not valid) into yes, no
  from public.event_votes where event_id = p_event;

  if eligible = 0 or yes * 2 > eligible then
    -- Escudo anti-quiebre: se aplica recién cuando el quiebre queda validado
    if e.kind = 'quiebre' then
      select pc.id into shield
      from public.player_cards pc
      join public.card_catalog cc on cc.key = pc.card_key
      where pc.trip_id = e.trip_id and pc.user_id = e.user_id and pc.status = 'active' and cc.effect = 'shield'
      order by pc.redeemed_at
      limit 1
      for update of pc;

      if found then
        update public.player_cards set status = 'used', used_at = now() where id = shield;
        update public.trip_events
        set status = 'approved', resolved_at = now(), points = 0,
            title = 'Quebró, pero lo salvó el escudo', card_id = shield
        where id = p_event;
        return 'approved';
      end if;
    end if;

    update public.trip_events set status = 'approved', resolved_at = now() where id = p_event;
    return 'approved';
  end if;

  if no * 2 >= eligible then
    -- Si el trago usaba "Doble o nada", el comodín vuelve a quedar activo
    if e.kind = 'drink' and e.card_id is not null then
      update public.player_cards set status = 'active', used_at = null where id = e.card_id and status = 'used';
    end if;
    update public.trip_events set status = 'rejected', resolved_at = now() where id = p_event;
    return 'rejected';
  end if;

  return 'pending';
end;
$$;

create or replace function public.vote_event(p_event uuid, p_valid boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.trip_events%rowtype;
  me uuid;
begin
  select * into e from public.trip_events where id = p_event;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  me := public.require_trip_member(e.trip_id);

  if e.status <> 'pending' then
    raise exception 'EVENT_ALREADY_RESOLVED';
  end if;
  if me = e.actor_id or me = e.user_id then
    raise exception 'CANNOT_VOTE_OWN';
  end if;

  insert into public.event_votes (event_id, trip_id, voter_id, valid)
  values (p_event, e.trip_id, me, p_valid)
  on conflict (event_id, voter_id) do update set valid = excluded.valid, created_at = now();

  return public.resolve_event(p_event);
end;
$$;

-- ============================================================
-- RPCs del juego actualizados (jornada por viaje + validación)
-- ============================================================

create or replace function public.log_drink(p_trip uuid, p_drink uuid, p_photo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  drink public.trip_drinks%rowtype;
  double_card uuid;
  pts int;
  label text;
  new_event uuid;
begin
  select * into drink from public.trip_drinks
  where id = p_drink and trip_id = p_trip and not archived;
  if not found then
    raise exception 'DRINK_NOT_FOUND';
  end if;

  if not public.valid_fresh_photo(p_trip, me, p_photo) then
    raise exception 'PHOTO_REQUIRED';
  end if;

  pts := drink.points;
  label := drink.name;

  select pc.id into double_card
  from public.player_cards pc
  join public.card_catalog cc on cc.key = pc.card_key
  where pc.trip_id = p_trip and pc.user_id = me and pc.status = 'active' and cc.effect = 'double'
  order by pc.redeemed_at
  limit 1
  for update of pc;

  if found then
    pts := pts * 2;
    label := label || ' (x2)';
    update public.player_cards set status = 'used', used_at = now() where id = double_card;
  end if;

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, drink_id, card_id, status)
  values (p_trip, me, me, 'drink', pts, public.trip_day_for(p_trip), label, drink.emoji, array[p_photo], drink.id, double_card, 'pending')
  returning id into new_event;

  perform public.resolve_event(new_event);
  return new_event;
end;
$$;

create or replace function public.report_quiebre(p_trip uuid, p_user uuid, p_photos text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  photos text[] := coalesce(p_photos, '{}');
  photo text;
  penalty int;
  new_event uuid;
begin
  if not public.is_trip_member(p_trip, p_user) then
    raise exception 'NOT_TRIP_MEMBER';
  end if;

  if cardinality(photos) < 1 or cardinality(photos) > 3
     or cardinality(photos) <> (select count(distinct x) from unnest(photos) as x) then
    raise exception 'QUIEBRE_PHOTOS_REQUIRED';
  end if;
  foreach photo in array photos loop
    if not public.valid_fresh_photo(p_trip, me, photo) then
      raise exception 'QUIEBRE_PHOTOS_REQUIRED';
    end if;
  end loop;

  select quiebre_penalty into penalty from public.trips where id = p_trip;

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, status)
  values (p_trip, p_user, me, 'quiebre', -penalty, public.trip_day_for(p_trip), 'Quebró', '😵', photos, 'pending')
  returning id into new_event;

  perform public.resolve_event(new_event);
  return new_event;
end;
$$;

create or replace function public.choose_daily_mission(p_trip uuid, p_difficulty text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  today date := public.trip_day_for(p_trip);
  t public.trips%rowtype;
  picked text;
  pts int;
  new_id uuid;
begin
  if p_difficulty not in ('easy', 'medium', 'extreme') then
    raise exception 'INVALID_DIFFICULTY';
  end if;

  if exists (
    select 1 from public.daily_missions where trip_id = p_trip and user_id = me and day = today
  ) then
    raise exception 'MISSION_ALREADY_CHOSEN';
  end if;

  select * into t from public.trips where id = p_trip;
  pts := case p_difficulty
    when 'easy' then t.mission_points_easy
    when 'medium' then t.mission_points_medium
    else t.mission_points_extreme
  end;

  select mission into picked from public.mission_catalog
  where difficulty = p_difficulty
  order by random()
  limit 1;

  insert into public.daily_missions (trip_id, user_id, day, difficulty, mission, points)
  values (p_trip, me, today, p_difficulty, picked, pts)
  returning id into new_id;

  return new_id;
end;
$$;

-- complete_daily_mission y redeem_card se redefinen más abajo (usan las votaciones)

create or replace function public.spin_roulette(p_trip uuid, p_day date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  top int;
  mine int;
  won text;
begin
  if p_day is null or p_day >= public.trip_day_for(p_trip) then
    raise exception 'DAY_NOT_FINISHED';
  end if;

  -- Solo cuentan los puntos validados
  select max(total) into top from (
    select sum(points) as total from public.trip_events
    where trip_id = p_trip and day = p_day and status = 'approved'
    group by user_id
  ) t;

  select coalesce(sum(points), 0) into mine from public.trip_events
  where trip_id = p_trip and day = p_day and user_id = me and status = 'approved';

  if top is null or top <= 0 or mine < top then
    raise exception 'NOT_DAY_WINNER';
  end if;

  if exists (
    select 1 from public.player_cards where trip_id = p_trip and user_id = me and won_day = p_day
  ) then
    raise exception 'ALREADY_SPUN';
  end if;

  select key into won from public.card_catalog
  order by -ln(1.0 - random()) / weight
  limit 1;

  insert into public.player_cards (trip_id, user_id, card_key, won_day)
  values (p_trip, me, won, p_day);

  return won;
end;
$$;

-- ============================================================
-- Votación de misiones "malas"
-- 1. Alguien abre la votación sobre la misión de otro jugador (10 min para votar)
-- 2. Si la mayoría dice que es mala, cada uno escribe una opción (3 min)
-- 3. Votación de 60 segundos para elegir la nueva misión
-- No vota (ni propone) el dueño de la misión.
-- ============================================================

alter table public.daily_missions
  add column group_assigned boolean not null default false;

create table public.mission_challenges (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  mission_id uuid not null unique references public.daily_missions (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  started_by uuid not null references public.profiles (id) on delete cascade,
  phase text not null default 'vote_bad'
    check (phase in ('vote_bad', 'proposals', 'vote_option', 'replaced', 'kept')),
  bad_until timestamptz not null,
  proposals_until timestamptz,
  voting_until timestamptz,
  winner_option_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index mission_challenges_trip_idx on public.mission_challenges (trip_id);

create table public.challenge_bad_votes (
  challenge_id uuid not null references public.mission_challenges (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  bad boolean not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, voter_id)
);

create table public.challenge_options (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.mission_challenges (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 5 and 140),
  created_at timestamptz not null default now(),
  unique (challenge_id, author_id)
);

alter table public.mission_challenges
  add constraint mission_challenges_winner_fkey
  foreign key (winner_option_id) references public.challenge_options (id) on delete set null;

create table public.challenge_option_votes (
  challenge_id uuid not null references public.mission_challenges (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  option_id uuid not null references public.challenge_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (challenge_id, voter_id)
);

create index challenge_bad_votes_trip_idx on public.challenge_bad_votes (trip_id);
create index challenge_options_trip_idx on public.challenge_options (trip_id);
create index challenge_option_votes_trip_idx on public.challenge_option_votes (trip_id);

-- Avanza la votación según votos y tiempos. Es idempotente: se puede llamar siempre.
create or replace function public.resolve_challenge(p_challenge uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.mission_challenges%rowtype;
  eligible int;
  bad int;
  ok int;
  n_opts int;
  n_votes int;
  can_vote int;
  win uuid;
  win_text text;
begin
  select * into c from public.mission_challenges where id = p_challenge for update;
  if not found then
    return 'missing';
  end if;
  if c.phase in ('replaced', 'kept') then
    return c.phase;
  end if;

  select count(*) into eligible
  from public.trip_members where trip_id = c.trip_id and user_id <> c.target_user_id;

  if c.phase = 'vote_bad' then
    select count(*) filter (where v.bad), count(*) filter (where not v.bad) into bad, ok
    from public.challenge_bad_votes v where v.challenge_id = c.id;

    if bad * 2 > eligible then
      c.phase := 'proposals';
      c.proposals_until := now() + interval '3 minutes';
      update public.mission_challenges
      set phase = c.phase, proposals_until = c.proposals_until
      where id = c.id;
    elsif ok * 2 >= eligible or now() >= c.bad_until then
      update public.mission_challenges set phase = 'kept', resolved_at = now() where id = c.id;
      return 'kept';
    else
      return 'vote_bad';
    end if;
  end if;

  if c.phase = 'proposals' then
    select count(*) into n_opts from public.challenge_options where challenge_id = c.id;
    if n_opts < eligible and now() < c.proposals_until then
      return 'proposals';
    end if;
    if n_opts = 0 then
      update public.mission_challenges set phase = 'kept', resolved_at = now() where id = c.id;
      return 'kept';
    end if;
    if n_opts > 1 then
      update public.mission_challenges
      set phase = 'vote_option', voting_until = now() + interval '60 seconds'
      where id = c.id;
      return 'vote_option';
    end if;
    -- Una sola opción: se asigna directo (cae al bloque de asignación)
  elsif c.phase = 'vote_option' then
    select count(*) into n_votes from public.challenge_option_votes where challenge_id = c.id;
    -- Pueden votar los que tienen al menos una opción que no sea suya
    select count(*) into can_vote
    from public.trip_members m
    where m.trip_id = c.trip_id and m.user_id <> c.target_user_id
      and exists (
        select 1 from public.challenge_options o where o.challenge_id = c.id and o.author_id <> m.user_id
      );
    if now() < c.voting_until and n_votes < can_vote then
      return 'vote_option';
    end if;
  end if;

  -- Asignar la opción más votada (empate o sin votos: al azar entre las mejores)
  select o.id, o.text into win, win_text
  from public.challenge_options o
  left join public.challenge_option_votes v on v.option_id = o.id
  where o.challenge_id = c.id
  group by o.id, o.text
  order by count(v.voter_id) desc, random()
  limit 1;

  update public.daily_missions set mission = win_text, group_assigned = true where id = c.mission_id;
  update public.mission_challenges
  set phase = 'replaced', winner_option_id = win, resolved_at = now()
  where id = c.id;
  return 'replaced';
end;
$$;

create or replace function public.start_mission_challenge(p_mission uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.daily_missions%rowtype;
  me uuid;
  new_id uuid;
begin
  select * into m from public.daily_missions where id = p_mission;
  if not found then
    raise exception 'MISSION_NOT_FOUND';
  end if;
  me := public.require_trip_member(m.trip_id);

  if m.user_id = me then
    raise exception 'CANNOT_CHALLENGE_OWN';
  end if;
  if m.day <> public.trip_day_for(m.trip_id) then
    raise exception 'MISSION_NOT_TODAY';
  end if;
  if m.completed_at is not null then
    raise exception 'MISSION_ALREADY_DONE';
  end if;
  if exists (select 1 from public.mission_challenges where mission_id = p_mission) then
    raise exception 'CHALLENGE_EXISTS';
  end if;

  insert into public.mission_challenges (trip_id, mission_id, target_user_id, started_by, bad_until)
  values (m.trip_id, m.id, m.user_id, me, now() + interval '10 minutes')
  returning id into new_id;

  insert into public.challenge_bad_votes (challenge_id, trip_id, voter_id, bad)
  values (new_id, m.trip_id, me, true);

  perform public.resolve_challenge(new_id);
  return new_id;
end;
$$;

create or replace function public.challenge_for_voter(p_challenge uuid)
returns public.mission_challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.mission_challenges%rowtype;
  me uuid;
begin
  -- Primero aplicar vencimientos
  perform public.resolve_challenge(p_challenge);
  select * into c from public.mission_challenges where id = p_challenge;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;
  me := public.require_trip_member(c.trip_id);
  if me = c.target_user_id then
    raise exception 'CANNOT_VOTE_OWN_MISSION';
  end if;
  return c;
end;
$$;

create or replace function public.vote_mission_bad(p_challenge uuid, p_bad boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.mission_challenges%rowtype := public.challenge_for_voter(p_challenge);
begin
  if c.phase <> 'vote_bad' then
    raise exception 'CHALLENGE_CLOSED';
  end if;
  insert into public.challenge_bad_votes (challenge_id, trip_id, voter_id, bad)
  values (c.id, c.trip_id, auth.uid(), p_bad)
  on conflict (challenge_id, voter_id) do update set bad = excluded.bad, created_at = now();
  return public.resolve_challenge(c.id);
end;
$$;

create or replace function public.propose_mission_option(p_challenge uuid, p_text text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.mission_challenges%rowtype := public.challenge_for_voter(p_challenge);
  clean text := trim(coalesce(p_text, ''));
begin
  if c.phase <> 'proposals' then
    raise exception 'CHALLENGE_CLOSED';
  end if;
  if char_length(clean) < 5 or char_length(clean) > 140 then
    raise exception 'OPTION_INVALID';
  end if;
  insert into public.challenge_options (challenge_id, trip_id, author_id, text)
  values (c.id, c.trip_id, auth.uid(), clean)
  on conflict (challenge_id, author_id) do update set text = excluded.text;
  return public.resolve_challenge(c.id);
end;
$$;

-- Cualquiera puede cortar las propuestas y arrancar la votación si ya hay 2 opciones
create or replace function public.start_option_vote(p_challenge uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.mission_challenges%rowtype := public.challenge_for_voter(p_challenge);
begin
  if c.phase <> 'proposals' then
    raise exception 'CHALLENGE_CLOSED';
  end if;
  if (select count(*) from public.challenge_options where challenge_id = c.id) < 2 then
    raise exception 'NEED_MORE_OPTIONS';
  end if;
  update public.mission_challenges
  set phase = 'vote_option', voting_until = now() + interval '60 seconds'
  where id = c.id and phase = 'proposals';
  return 'vote_option';
end;
$$;

create or replace function public.vote_mission_option(p_challenge uuid, p_option uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.mission_challenges%rowtype := public.challenge_for_voter(p_challenge);
  o public.challenge_options%rowtype;
begin
  if c.phase <> 'vote_option' then
    raise exception 'VOTING_CLOSED';
  end if;
  select * into o from public.challenge_options where id = p_option and challenge_id = c.id;
  if not found then
    raise exception 'OPTION_INVALID';
  end if;
  if o.author_id = auth.uid() then
    raise exception 'CANNOT_VOTE_OWN_OPTION';
  end if;
  insert into public.challenge_option_votes (challenge_id, trip_id, voter_id, option_id)
  values (c.id, c.trip_id, auth.uid(), p_option)
  on conflict (challenge_id, voter_id) do update set option_id = excluded.option_id, created_at = now();
  return public.resolve_challenge(c.id);
end;
$$;

-- La app lo llama al abrir el viaje: cierra votaciones vencidas
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
end;
$$;

-- No se puede cumplir una misión mientras la están votando
create or replace function public.complete_daily_mission(p_trip uuid, p_photo text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  m public.daily_missions%rowtype;
  new_event uuid;
begin
  perform public.tick_trip(p_trip);

  select * into m from public.daily_missions
  where trip_id = p_trip and user_id = me and day = public.trip_day_for(p_trip)
  for update;

  if not found then
    raise exception 'MISSION_NOT_FOUND';
  end if;
  if m.completed_at is not null then
    raise exception 'MISSION_ALREADY_DONE';
  end if;
  if exists (
    select 1 from public.mission_challenges
    where mission_id = m.id and phase in ('vote_bad', 'proposals', 'vote_option')
  ) then
    raise exception 'MISSION_UNDER_VOTE';
  end if;
  if p_photo is not null and not public.valid_fresh_photo(p_trip, me, p_photo) then
    raise exception 'PHOTO_REQUIRED';
  end if;

  update public.daily_missions set completed_at = now(), photo_path = p_photo where id = m.id;

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, photo_paths)
  values (
    p_trip, me, me, 'mission', m.points, m.day,
    case m.difficulty when 'easy' then 'Misión fácil cumplida'
                      when 'medium' then 'Misión intermedia cumplida'
                      else 'Misión extrema cumplida' end,
    case m.difficulty when 'easy' then '🎯' when 'medium' then '🔥' else '💀' end,
    m.mission,
    case when p_photo is null then '{}'::text[] else array[p_photo] end
  )
  returning id into new_event;

  return new_event;
end;
$$;

create or replace function public.redeem_card(p_card uuid, p_target uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  card public.player_cards%rowtype;
  def public.card_catalog%rowtype;
  today date;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into card from public.player_cards
  where id = p_card and user_id = me and status = 'available'
  for update;
  if not found then
    raise exception 'CARD_NOT_AVAILABLE';
  end if;
  perform public.require_trip_member(card.trip_id);
  today := public.trip_day_for(card.trip_id);

  select * into def from public.card_catalog where key = card.card_key;

  if def.effect = 'bonus' then
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, card_id)
    values (card.trip_id, me, me, 'card', def.value, today, 'Comodín: Ronda de la casa', '🎁', card.id);
    update public.player_cards set status = 'used', redeemed_at = now(), used_at = now() where id = card.id;

  elsif def.effect = 'steal' then
    if p_target is null or p_target = me or not public.is_trip_member(card.trip_id, p_target) then
      raise exception 'TARGET_REQUIRED';
    end if;
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, card_id) values
      (card.trip_id, p_target, me, 'card', -def.value, today, 'Le robaron puntos (Manotazo)', '🦹', card.id),
      (card.trip_id, me, me, 'card', def.value, today, 'Comodín: Manotazo', '🦹', card.id);
    update public.player_cards
    set status = 'used', target_user_id = p_target, redeemed_at = now(), used_at = now()
    where id = card.id;

  elsif def.effect in ('double', 'shield') then
    update public.player_cards set status = 'active', redeemed_at = now() where id = card.id;

  else
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, card_id)
    values (
      card.trip_id, me, me, 'card', 0, today,
      case card.card_key when 'dj' then 'Comodín: DJ de la noche' else 'Comodín: Brindis en tu honor' end,
      case card.card_key when 'dj' then '🎧' else '🥂' end,
      card.id
    );
    update public.player_cards set status = 'used', redeemed_at = now(), used_at = now() where id = card.id;
  end if;

  return def.effect;
end;
$$;

-- Pendientes del usuario en todos sus viajes (para el aviso del inicio)
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
  )
  select trip_id, count(*) from items group by trip_id;
$$;

-- ============================================================
-- Misiones bien argentinas (reemplazan a las anteriores)
-- ============================================================

delete from public.mission_catalog;

insert into public.mission_catalog (difficulty, mission) values
  ('easy', 'Sacate una selfie con todo el grupo haciendo cuernitos 🤘.'),
  ('easy', 'Cebale un mate (o lo que haya) a cada uno del grupo.'),
  ('easy', 'Hablá sin decir "boludo" durante 15 minutos. Si se te escapa, arrancás de cero.'),
  ('easy', 'Contá la anécdota más bizarra de tu vida y que al menos uno se ría.'),
  ('easy', 'Proponé un brindis y que todo el grupo choque los vasos.'),
  ('easy', 'Validá las fotos de tragos de tus amigos sin hacerte rogar durante toda la jornada.'),
  ('easy', 'Cargá un vaso de agua en la app antes de tu próximo trago.'),
  ('easy', 'Poné un tema de cumbia y conseguí que al menos 2 lo bailen con vos.'),
  ('easy', 'Pedí la próxima ronda hablando con tonada cordobesa.'),
  ('easy', 'Ponele un apodo a cada uno del grupo y que todos lo usen hasta mañana.'),
  ('medium', 'Chamuyate a alguien del lugar hasta que se ría (con onda: si no da, no da).'),
  ('medium', 'Relatá como un gol de Argentina en la final del Mundial el próximo trago que carguen.'),
  ('medium', 'Conseguí que un desconocido te diga su fernet ideal, con proporciones incluidas.'),
  ('medium', 'Hacé que todo el grupo cante un cantito de cancha (que no sea ofensivo).'),
  ('medium', 'Conseguí que alguien que no conocés se saque una foto con el grupo.'),
  ('medium', 'Hablá como un porteño cheto durante 15 minutos.'),
  ('medium', 'Sé el mozo del grupo: traé la próxima ronda para todos (de agua también vale).'),
  ('medium', 'Sacale foto a tu próximo trago como si fuera una publicidad y que te lo validen.'),
  ('medium', 'Ganate un abrazo de alguien que no conocías hasta hoy.'),
  ('medium', 'Imitá a alguien del grupo hasta que adivinen quién es.'),
  ('extreme', 'Chamuyate a alguien que te guste y conseguí su Instagram (si dice que no, es no).'),
  ('extreme', 'Cantá una canción entera de cuarteto o cumbia delante de todos.'),
  ('extreme', 'Subite a una silla y hacé un discurso de 1 minuto sobre por qué sos el mejor del viaje.'),
  ('extreme', 'Conseguí que pasen en el lugar un tema que vos elijas.'),
  ('extreme', 'Bailá solo en el medio de la pista una canción entera.'),
  ('extreme', 'Hacele una declaración de amor de telenovela a alguien del grupo.'),
  ('extreme', 'Conseguí 3 firmas de desconocidos en una servilleta que diga "Aguante EscabiARG".'),
  ('extreme', 'Terminá la jornada primero en la tabla diaria.'),
  ('extreme', 'Llegá al final de la jornada sin quebrar y con 2 vasos de agua cargados en la app.'),
  ('extreme', 'Hacé un TikTok bailando con al menos 3 del grupo.');

-- ============================================================
-- Permisos y RLS
-- ============================================================

alter table public.event_votes enable row level security;
alter table public.mission_challenges enable row level security;
alter table public.challenge_bad_votes enable row level security;
alter table public.challenge_options enable row level security;
alter table public.challenge_option_votes enable row level security;

revoke all on public.event_votes, public.mission_challenges, public.challenge_bad_votes,
  public.challenge_options, public.challenge_option_votes from anon, authenticated;
grant select on public.event_votes, public.mission_challenges, public.challenge_bad_votes,
  public.challenge_options, public.challenge_option_votes to authenticated;

create policy "Ver votos de mis viajes" on public.event_votes for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver votaciones de misiones" on public.mission_challenges for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver votos de misión mala" on public.challenge_bad_votes for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver opciones de misión" on public.challenge_options for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver votos de opciones" on public.challenge_option_votes for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

revoke execute on function
  public.trip_day_for(uuid, timestamptz),
  public.resolve_event(uuid),
  public.vote_event(uuid, boolean),
  public.resolve_challenge(uuid),
  public.start_mission_challenge(uuid),
  public.challenge_for_voter(uuid),
  public.vote_mission_bad(uuid, boolean),
  public.propose_mission_option(uuid, text),
  public.start_option_vote(uuid),
  public.vote_mission_option(uuid, uuid),
  public.tick_trip(uuid),
  public.my_pending()
from public, anon, authenticated;

grant execute on function
  public.trip_day_for(uuid, timestamptz),
  public.vote_event(uuid, boolean),
  public.start_mission_challenge(uuid),
  public.vote_mission_bad(uuid, boolean),
  public.propose_mission_option(uuid, text),
  public.start_option_vote(uuid),
  public.vote_mission_option(uuid, uuid),
  public.tick_trip(uuid),
  public.my_pending()
to authenticated;
