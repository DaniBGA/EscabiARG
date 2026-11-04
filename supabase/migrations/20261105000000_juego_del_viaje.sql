-- EscabiARG: el juego dentro de cada viaje
-- Tragos con puntos, misiones diarias, quiebres, puntaje diario/general,
-- ruleta para el ganador del día y cartas comodín.
-- Ejecutar DESPUÉS de 20261104000000_amigos_y_viajes.sql

-- ============================================================
-- Jornada: de 6:00 a 6:00 (hora Argentina), así una noche que pasa
-- la medianoche cuenta como un solo día.
-- ============================================================

create or replace function public.trip_day(ts timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select ((ts at time zone 'America/Argentina/Buenos_Aires') - interval '6 hours')::date;
$$;

-- ============================================================
-- Reglas del viaje (las define el organizador)
-- ============================================================

alter table public.trips
  add column mission_points_easy int not null default 10 check (mission_points_easy between 0 and 500),
  add column mission_points_medium int not null default 25 check (mission_points_medium between 0 and 500),
  add column mission_points_extreme int not null default 50 check (mission_points_extreme between 0 and 500),
  add column quiebre_penalty int not null default 30 check (quiebre_penalty between 0 and 500);

-- ============================================================
-- Tablas
-- ============================================================

create table public.trip_drinks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '🍺' check (char_length(emoji) between 1 and 8),
  points int not null check (points between 1 and 500),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index trip_drinks_trip_id_idx on public.trip_drinks (trip_id);

create table public.mission_catalog (
  id serial primary key,
  difficulty text not null check (difficulty in ('easy', 'medium', 'extreme')),
  mission text not null
);

create table public.daily_missions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'extreme')),
  mission text not null,
  points int not null,
  completed_at timestamptz,
  photo_path text,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id, day)
);

-- Las claves tienen que coincidir con src/lib/game.ts (nombres y textos viven en el cliente)
create table public.card_catalog (
  key text primary key,
  effect text not null check (effect in ('bonus', 'steal', 'double', 'shield', 'social')),
  value int not null default 0,
  weight int not null check (weight > 0)
);

create table public.player_cards (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_key text not null references public.card_catalog (key),
  won_day date not null,
  status text not null default 'available' check (status in ('available', 'active', 'used')),
  target_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  used_at timestamptz,
  unique (trip_id, user_id, won_day)
);

create table public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  -- a quién le suman/restan los puntos
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- quién lo cargó (en un quiebre, el que lo reporta)
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('drink', 'mission', 'quiebre', 'card')),
  points int not null,
  day date not null,
  title text not null,
  emoji text not null default '',
  detail text,
  photo_paths text[] not null default '{}',
  drink_id uuid references public.trip_drinks (id) on delete set null,
  card_id uuid references public.player_cards (id) on delete set null,
  created_at timestamptz not null default now()
);

create index trip_events_trip_day_idx on public.trip_events (trip_id, day);
create index trip_events_trip_created_idx on public.trip_events (trip_id, created_at desc);

-- ============================================================
-- Datos fijos: misiones y comodines
-- ============================================================

insert into public.mission_catalog (difficulty, mission) values
  ('easy', 'Sacate una selfie con todo el grupo.'),
  ('easy', 'Hacé un brindis con alguien que no conocías antes de hoy.'),
  ('easy', 'Contá un chiste y conseguí que al menos uno se ría.'),
  ('easy', 'Pedí una canción y bailala entera.'),
  ('easy', 'Tomá un vaso de agua entre trago y trago durante una hora.'),
  ('easy', 'Aprendete el nombre de alguien del lugar y saludalo por su nombre.'),
  ('medium', 'Conseguí que un desconocido se saque una foto con el grupo.'),
  ('medium', 'Hablá con acento de otra provincia durante 15 minutos.'),
  ('medium', 'Inventá un brindis que rime y recitalo frente al grupo.'),
  ('medium', 'Conseguí que alguien te enseñe un paso de baile nuevo.'),
  ('medium', 'Traé algo para picar para todo el grupo.'),
  ('medium', 'Imitá a alguien del grupo hasta que adivinen quién es.'),
  ('extreme', 'Cantá una canción entera delante de todos.'),
  ('extreme', 'Conseguí que pasen un tema que vos elijas.'),
  ('extreme', 'Bailá en el medio de la pista durante una canción entera.'),
  ('extreme', 'Conseguí 3 firmas de desconocidos en una servilleta.'),
  ('extreme', 'Armá una coreografía con al menos 3 del grupo y muéstrenla.'),
  ('extreme', 'Hacé un discurso de 1 minuto sobre por qué sos el mejor del viaje.');

insert into public.card_catalog (key, effect, value, weight) values
  ('ronda_casa', 'bonus', 20, 3),
  ('manotazo', 'steal', 15, 2),
  ('doble', 'double', 0, 3),
  ('escudo', 'shield', 0, 2),
  ('dj', 'social', 0, 2),
  ('brindis', 'social', 0, 2);

-- ============================================================
-- Helpers
-- ============================================================

create or replace function public.is_trip_owner(p_trip uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trips where id = p_trip and owner_id = p_user);
$$;

-- Para las políticas de Storage (la carpeta llega como texto)
create or replace function public.is_trip_member_text(p_trip text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members where trip_id::text = p_trip and user_id = p_user
  );
$$;

-- Una foto válida: está en la carpeta del viaje y del usuario, se subió
-- hace menos de 30 minutos y no se usó antes para otra cosa.
create or replace function public.valid_fresh_photo(p_trip uuid, p_user uuid, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_path is not null
    and p_path like p_trip::text || '/' || p_user::text || '/%'
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'trip-photos'
        and o.name = p_path
        and o.created_at > now() - interval '30 minutes'
    )
    and not exists (
      select 1 from public.trip_events e where e.trip_id = p_trip and p_path = any (e.photo_paths)
    )
    and not exists (
      select 1 from public.daily_missions m where m.trip_id = p_trip and m.photo_path = p_path
    );
$$;

create or replace function public.require_trip_member(p_trip uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_trip_member(p_trip, me) then
    raise exception 'NOT_TRIP_MEMBER';
  end if;
  return me;
end;
$$;

-- ============================================================
-- RPCs del juego
-- ============================================================

-- Cargar un trago (con foto)
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

  -- Comodín "Doble o nada" activo
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

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, drink_id, card_id)
  values (p_trip, me, me, 'drink', pts, public.trip_day(), label, drink.emoji, array[p_photo], drink.id, double_card)
  returning id into new_event;

  return new_event;
end;
$$;

-- Elegir la dificultad de la misión de hoy (se asigna una al azar)
create or replace function public.choose_daily_mission(p_trip uuid, p_difficulty text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  today date := public.trip_day();
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

-- Marcar la misión de hoy como cumplida (foto opcional)
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
  select * into m from public.daily_missions
  where trip_id = p_trip and user_id = me and day = public.trip_day()
  for update;

  if not found then
    raise exception 'MISSION_NOT_FOUND';
  end if;
  if m.completed_at is not null then
    raise exception 'MISSION_ALREADY_DONE';
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

-- Reportar que alguien quebró (con 1 a 3 fotos)
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
  shield uuid;
  pts int;
  label text := 'Quebró';
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
  pts := -penalty;

  -- Comodín "Escudo anti-quiebre" activo del que quebró
  select pc.id into shield
  from public.player_cards pc
  join public.card_catalog cc on cc.key = pc.card_key
  where pc.trip_id = p_trip and pc.user_id = p_user and pc.status = 'active' and cc.effect = 'shield'
  order by pc.redeemed_at
  limit 1
  for update of pc;

  if found then
    pts := 0;
    label := 'Quebró, pero lo salvó el escudo';
    update public.player_cards set status = 'used', used_at = now() where id = shield;
  end if;

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, card_id)
  values (p_trip, p_user, me, 'quiebre', pts, public.trip_day(), label, '😵', photos, shield)
  returning id into new_event;

  return new_event;
end;
$$;

-- El ganador de una jornada ya terminada gira la ruleta y se lleva un comodín
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
  if p_day is null or p_day >= public.trip_day() then
    raise exception 'DAY_NOT_FINISHED';
  end if;

  select max(total) into top from (
    select sum(points) as total from public.trip_events
    where trip_id = p_trip and day = p_day
    group by user_id
  ) t;

  select coalesce(sum(points), 0) into mine from public.trip_events
  where trip_id = p_trip and day = p_day and user_id = me;

  if top is null or top <= 0 or mine < top then
    raise exception 'NOT_DAY_WINNER';
  end if;

  if exists (
    select 1 from public.player_cards where trip_id = p_trip and user_id = me and won_day = p_day
  ) then
    raise exception 'ALREADY_SPUN';
  end if;

  -- Sorteo ponderado por "weight"
  select key into won from public.card_catalog
  order by -ln(1.0 - random()) / weight
  limit 1;

  insert into public.player_cards (trip_id, user_id, card_key, won_day)
  values (p_trip, me, won, p_day);

  return won;
end;
$$;

-- Usar un comodín
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
  today date := public.trip_day();
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
    -- Queda activo hasta el próximo trago / quiebre
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

-- ============================================================
-- Permisos y RLS
-- ============================================================

alter table public.trip_drinks enable row level security;
alter table public.mission_catalog enable row level security;
alter table public.daily_missions enable row level security;
alter table public.card_catalog enable row level security;
alter table public.player_cards enable row level security;
alter table public.trip_events enable row level security;

revoke all on public.trip_drinks, public.mission_catalog, public.daily_missions,
  public.card_catalog, public.player_cards, public.trip_events from anon, authenticated;
revoke all on sequence public.mission_catalog_id_seq from anon, authenticated;

grant select on public.trip_drinks, public.daily_missions, public.card_catalog,
  public.player_cards, public.trip_events to authenticated;

-- Solo el organizador carga y edita tragos y reglas
grant insert (trip_id, name, emoji, points) on public.trip_drinks to authenticated;
grant update (name, emoji, points, archived) on public.trip_drinks to authenticated;
grant update (mission_points_easy, mission_points_medium, mission_points_extreme, quiebre_penalty)
  on public.trips to authenticated;

create policy "Ver tragos de mis viajes"
  on public.trip_drinks for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

create policy "El organizador agrega tragos"
  on public.trip_drinks for insert to authenticated
  with check (public.is_trip_owner(trip_id, (select auth.uid())));

create policy "El organizador edita tragos"
  on public.trip_drinks for update to authenticated
  using (public.is_trip_owner(trip_id, (select auth.uid())))
  with check (public.is_trip_owner(trip_id, (select auth.uid())));

create policy "El organizador edita las reglas"
  on public.trips for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Ver misiones de mis viajes"
  on public.daily_missions for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

create policy "Ver catálogo de comodines"
  on public.card_catalog for select to authenticated
  using (true);

create policy "Ver comodines de mis viajes"
  on public.player_cards for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

create policy "Ver actividad de mis viajes"
  on public.trip_events for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

revoke execute on function
  public.trip_day(timestamptz),
  public.is_trip_owner(uuid, uuid),
  public.is_trip_member_text(text, uuid),
  public.valid_fresh_photo(uuid, uuid, text),
  public.require_trip_member(uuid),
  public.log_drink(uuid, uuid, text),
  public.choose_daily_mission(uuid, text),
  public.complete_daily_mission(uuid, text),
  public.report_quiebre(uuid, uuid, text[]),
  public.spin_roulette(uuid, date),
  public.redeem_card(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.trip_day(timestamptz),
  public.is_trip_owner(uuid, uuid),
  public.is_trip_member_text(text, uuid),
  public.log_drink(uuid, uuid, text),
  public.choose_daily_mission(uuid, text),
  public.complete_daily_mission(uuid, text),
  public.report_quiebre(uuid, uuid, text[]),
  public.spin_roulette(uuid, date),
  public.redeem_card(uuid, uuid)
to authenticated;

-- ============================================================
-- Storage: fotos de tragos, misiones y quiebres
-- Ruta: <trip_id>/<user_id>/<archivo>.jpg (bucket privado)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Subir fotos a mi carpeta del viaje"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_trip_member_text((storage.foldername(name))[1], (select auth.uid()))
  );

create policy "Ver fotos de mis viajes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-photos'
    and public.is_trip_member_text((storage.foldername(name))[1], (select auth.uid()))
  );
