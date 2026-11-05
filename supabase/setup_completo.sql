-- ============================================================
-- EscabiARG — instalación completa de la base (proyecto NUEVO de Supabase)
--
-- Pegalo entero en Supabase > SQL Editor > New query > Run.
-- Es la unión, en orden, de todos los archivos de supabase/migrations/.
-- Si ya corriste alguna migración antes, NO uses este archivo:
-- corré solo las migraciones que te falten, en orden.
-- Va dentro de una transacción: si algo falla, no se aplica nada.
-- ============================================================

begin;

-- >>>>>>>>>> 20261104000000_amigos_y_viajes.sql <<<<<<<<<<

-- EscabiARG: perfiles, amigos y viajes
-- Ejecutar en Supabase: SQL Editor -> pegar este archivo -> Run
-- (o con la CLI: supabase db push)

-- ============================================================
-- Tablas
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  friend_code text not null unique check (friend_code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

create table public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index friendships_friend_id_idx on public.friendships (friend_id);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  trip_date date,
  place text check (place is null or char_length(place) <= 80),
  created_at timestamptz not null default now()
);

create index trips_owner_id_idx on public.trips (owner_id);

create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user_id_idx on public.trip_members (user_id);

-- ============================================================
-- Código de amigo y alta automática de perfil
-- ============================================================

-- 6 caracteres sin los ambiguos (0/O, 1/I/L)
create or replace function public.generate_friend_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Invitado'
  );

  insert into public.profiles (id, display_name, friend_code)
  values (new.id, left(v_name, 40), public.generate_friend_code());

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Helpers para RLS (security definer para evitar recursión)
-- ============================================================

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships where user_id = a and friend_id = b
  );
$$;

create or replace function public.is_trip_member(p_trip uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members where trip_id = p_trip and user_id = p_user
  );
$$;

create or replace function public.shares_trip(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members m1
    join public.trip_members m2 on m2.trip_id = m1.trip_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

-- ============================================================
-- RPCs (las escrituras pasan por acá)
-- ============================================================

-- Agrega un amigo por código. La amistad es mutua e inmediata.
create or replace function public.add_friend_by_code(p_code text)
returns table (id uuid, display_name text, friend_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target public.profiles%rowtype;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into target
  from public.profiles p
  where p.friend_code = upper(trim(p_code));

  if not found then
    raise exception 'FRIEND_CODE_NOT_FOUND';
  end if;

  if target.id = me then
    raise exception 'FRIEND_IS_SELF';
  end if;

  if public.are_friends(me, target.id) then
    raise exception 'ALREADY_FRIENDS';
  end if;

  insert into public.friendships (user_id, friend_id)
  values (me, target.id), (target.id, me)
  on conflict do nothing;

  return query select target.id, target.display_name, target.friend_code;
end;
$$;

create or replace function public.remove_friend(p_friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  delete from public.friendships
  where (user_id = me and friend_id = p_friend)
     or (user_id = p_friend and friend_id = me);
end;
$$;

-- Crea un viaje y suma como miembros a los amigos elegidos.
create or replace function public.create_trip(
  p_name text,
  p_trip_date date default null,
  p_place text default null,
  p_member_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_trip uuid;
  members uuid[];
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'TRIP_NAME_REQUIRED';
  end if;

  select coalesce(array_agg(distinct m), '{}') into members
  from unnest(coalesce(p_member_ids, '{}')) as m
  where m <> me;

  if exists (
    select 1 from unnest(members) as m where not public.are_friends(me, m)
  ) then
    raise exception 'MEMBER_NOT_FRIEND';
  end if;

  insert into public.trips (owner_id, name, trip_date, place)
  values (me, trim(p_name), p_trip_date, nullif(trim(coalesce(p_place, '')), ''))
  returning id into new_trip;

  insert into public.trip_members (trip_id, user_id, role)
  values (new_trip, me, 'owner');

  insert into public.trip_members (trip_id, user_id, role)
  select new_trip, m, 'member' from unnest(members) as m;

  return new_trip;
end;
$$;

-- ============================================================
-- Permisos y Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;

-- Nada para anon; los usuarios logueados (incluso invitados anónimos)
-- solo leen, y el único dato editable directo es su nombre.
revoke all on public.profiles, public.friendships, public.trips, public.trip_members from anon, authenticated;
grant select on public.profiles, public.friendships, public.trips, public.trip_members to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "Ver mi perfil, el de mis amigos y compañeros de viaje"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.are_friends((select auth.uid()), id)
    or public.shares_trip((select auth.uid()), id)
  );

create policy "Editar mi perfil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Ver mis amistades"
  on public.friendships for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Ver viajes donde participo"
  on public.trips for select to authenticated
  using (public.is_trip_member(id, (select auth.uid())));

create policy "Ver miembros de mis viajes"
  on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

-- Funciones: solo usuarios logueados
revoke execute on function
  public.generate_friend_code(),
  public.handle_new_user(),
  public.are_friends(uuid, uuid),
  public.is_trip_member(uuid, uuid),
  public.shares_trip(uuid, uuid),
  public.add_friend_by_code(text),
  public.remove_friend(uuid),
  public.create_trip(text, date, text, uuid[])
from public, anon, authenticated;

grant execute on function
  public.are_friends(uuid, uuid),
  public.is_trip_member(uuid, uuid),
  public.shares_trip(uuid, uuid),
  public.add_friend_by_code(text),
  public.remove_friend(uuid),
  public.create_trip(text, date, text, uuid[])
to authenticated;

-- >>>>>>>>>> 20261105000000_juego_del_viaje.sql <<<<<<<<<<

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

-- >>>>>>>>>> 20261106000000_validaciones_y_votaciones.sql <<<<<<<<<<

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

-- >>>>>>>>>> 20261107000000_prendas_ruleta_casino.sql <<<<<<<<<<

-- EscabiARG: infracciones y prendas, ruleta de "¿quién cocina / prepara el trago?"
-- y casino con temporizador.
-- Ejecutar DESPUÉS de 20261106000000_validaciones_y_votaciones.sql

-- ============================================================
-- Eventos nuevos y reglas
-- ============================================================

alter table public.trip_events drop constraint trip_events_kind_check;
alter table public.trip_events add constraint trip_events_kind_check
  check (kind in ('drink', 'mission', 'quiebre', 'card', 'infraction', 'chef', 'casino', 'forfeit'));

-- Referencia genérica (ej: la sesión de casino de un resultado)
alter table public.trip_events add column ref_id uuid;

alter table public.trips
  add column chef_points int not null default 20 check (chef_points between 0 and 500),
  add column casino_points int not null default 30 check (casino_points between 0 and 500);

grant update (chef_points, casino_points) on public.trips to authenticated;

-- ============================================================
-- Infracciones y prendas (listas por viaje, editables por el organizador)
-- ============================================================

create table public.trip_infractions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  emoji text not null default '📋' check (char_length(emoji) between 1 and 8),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index trip_infractions_trip_idx on public.trip_infractions (trip_id);

create table public.trip_forfeits (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  text text not null check (char_length(text) between 3 and 140),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index trip_forfeits_trip_idx on public.trip_forfeits (trip_id);

create table public.player_forfeits (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('infraction', 'chef')),
  reason text not null,
  forfeit text not null,
  status text not null default 'to_do' check (status in ('to_do', 'done')),
  event_id uuid references public.trip_events (id) on delete set null,
  photo_path text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create index player_forfeits_trip_idx on public.player_forfeits (trip_id);

-- Listas sugeridas para cada viaje
create or replace function public.seed_trip_lists(p_trip uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.trip_infractions (trip_id, emoji, name) values
    (p_trip, '😴', 'Levantarse tarde'),
    (p_trip, '🥴', 'Terminar roto'),
    (p_trip, '🕐', 'Llegar tarde'),
    (p_trip, '📱', 'Estar con el celu en la mesa'),
    (p_trip, '💸', 'No poner para la vaca'),
    (p_trip, '🍕', 'Comerse la última porción sin preguntar'),
    (p_trip, '💤', 'Dormirse en la previa'),
    (p_trip, '🧹', 'No ayudar a limpiar'),
    (p_trip, '👀', 'Clavar el visto en el grupo'),
    (p_trip, '🎶', 'Poner un tema que nadie banca');

  insert into public.trip_forfeits (trip_id, text) values
    (p_trip, 'Lavar los platos de todos.'),
    (p_trip, 'Cebar mate a todos durante la mañana.'),
    (p_trip, 'Preparar el desayuno para el grupo.'),
    (p_trip, 'Ir a comprar el hielo (caminando).'),
    (p_trip, 'Usar un gorro ridículo durante una hora.'),
    (p_trip, 'Hablar en tercera persona durante 30 minutos.'),
    (p_trip, 'Cantar una canción que elija el grupo.'),
    (p_trip, 'Hacer 15 sentadillas delante de todos.'),
    (p_trip, 'Contestar todo con "sí, mi capitán" durante 20 minutos.'),
    (p_trip, 'Llevar las mochilas del grupo en la próxima salida.'),
    (p_trip, 'Pedir disculpas en forma de poema.'),
    (p_trip, 'Ordenar y limpiar el lugar donde paran.'),
    (p_trip, 'Bailar sin música durante 30 segundos.'),
    (p_trip, 'Ser el DJ obligatorio y aguantar los pedidos de todos por una hora.');
$$;

create or replace function public.seed_trip_lists_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_trip_lists(new.id);
  return new;
end;
$$;

create trigger on_trip_created_seed_lists
  after insert on public.trips
  for each row execute function public.seed_trip_lists_trigger();

-- Viajes que ya existían
select public.seed_trip_lists(id) from public.trips;

-- Asigna una prenda al azar de la lista del viaje
create or replace function public.assign_forfeit(
  p_trip uuid, p_user uuid, p_source text, p_reason text, p_event uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked text;
  new_id uuid;
begin
  select text into picked from public.trip_forfeits
  where trip_id = p_trip and not archived
  order by random()
  limit 1;

  insert into public.player_forfeits (trip_id, user_id, source, reason, forfeit, event_id)
  values (p_trip, p_user, p_source, p_reason, coalesce(picked, 'Lavar los platos de todos.'), p_event)
  returning id into new_id;
  return new_id;
end;
$$;

-- ============================================================
-- Ruleta: ¿quién cocina / quién prepara el trago?
-- Arranca cuando entraron TODOS los del viaje. Nunca toca el mismo que la vez anterior.
-- Después el grupo vota si salió bueno: puntos o prenda.
-- ============================================================

create table public.chef_spins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind text not null check (kind in ('comida', 'trago')),
  started_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'joining'
    check (status in ('joining', 'cooking', 'voting', 'good', 'bad', 'cancelled')),
  chosen_user_id uuid references public.profiles (id) on delete set null,
  excluded_user_id uuid references public.profiles (id) on delete set null,
  photo_path text,
  created_at timestamptz not null default now(),
  spun_at timestamptz,
  voting_at timestamptz,
  resolved_at timestamptz
);

create index chef_spins_trip_idx on public.chef_spins (trip_id, created_at desc);

create table public.chef_spin_players (
  spin_id uuid not null references public.chef_spins (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (spin_id, user_id)
);

create table public.chef_votes (
  spin_id uuid not null references public.chef_spins (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  good boolean not null,
  created_at timestamptz not null default now(),
  primary key (spin_id, voter_id)
);

create or replace function public.chef_do_spin(p_spin uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.chef_spins%rowtype;
  previous uuid;
  chosen uuid;
begin
  select * into s from public.chef_spins where id = p_spin for update;
  if s.status <> 'joining' then
    return s.chosen_user_id;
  end if;

  -- La "anterior" es la última que se giró (reloj real, no el de la transacción)
  select chosen_user_id into previous from public.chef_spins
  where trip_id = s.trip_id and id <> s.id and chosen_user_id is not null
  order by spun_at desc nulls last, created_at desc
  limit 1;

  select m.user_id into chosen from public.trip_members m
  where m.trip_id = s.trip_id
    and (previous is null or m.user_id <> previous
         or (select count(*) from public.trip_members where trip_id = s.trip_id) = 1)
  order by random()
  limit 1;

  update public.chef_spins
  set status = 'cooking', chosen_user_id = chosen, excluded_user_id = previous, spun_at = clock_timestamp()
  where id = s.id;
  return chosen;
end;
$$;

create or replace function public.chef_try_spin(p_spin uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.chef_spins%rowtype;
begin
  select * into s from public.chef_spins where id = p_spin;
  if s.status = 'joining'
     and (select count(*) from public.chef_spin_players where spin_id = s.id)
         >= (select count(*) from public.trip_members where trip_id = s.trip_id) then
    perform public.chef_do_spin(s.id);
  end if;
end;
$$;

create or replace function public.start_chef_spin(p_trip uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  new_id uuid;
begin
  if p_kind not in ('comida', 'trago') then
    raise exception 'INVALID_KIND';
  end if;
  if exists (
    select 1 from public.chef_spins
    where trip_id = p_trip and status in ('joining', 'cooking', 'voting')
  ) then
    raise exception 'CHEF_SPIN_ACTIVE';
  end if;

  insert into public.chef_spins (trip_id, kind, started_by) values (p_trip, p_kind, me)
  returning id into new_id;
  insert into public.chef_spin_players (spin_id, trip_id, user_id) values (new_id, p_trip, me);
  perform public.chef_try_spin(new_id);
  return new_id;
end;
$$;

create or replace function public.join_chef_spin(p_spin uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.chef_spins%rowtype;
  me uuid;
begin
  select * into s from public.chef_spins where id = p_spin;
  if not found then
    raise exception 'CHEF_SPIN_NOT_FOUND';
  end if;
  me := public.require_trip_member(s.trip_id);
  if s.status <> 'joining' then
    raise exception 'CHEF_SPIN_CLOSED';
  end if;
  insert into public.chef_spin_players (spin_id, trip_id, user_id)
  values (s.id, s.trip_id, me)
  on conflict do nothing;
  perform public.chef_try_spin(s.id);
  return (select status from public.chef_spins where id = s.id);
end;
$$;

create or replace function public.cancel_chef_spin(p_spin uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.chef_spins%rowtype;
  me uuid;
begin
  select * into s from public.chef_spins where id = p_spin;
  if not found then
    raise exception 'CHEF_SPIN_NOT_FOUND';
  end if;
  me := public.require_trip_member(s.trip_id);
  if s.status <> 'joining' then
    raise exception 'CHEF_SPIN_CLOSED';
  end if;
  if me <> s.started_by and not public.is_trip_owner(s.trip_id, me) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.chef_spins set status = 'cancelled', resolved_at = now() where id = s.id;
end;
$$;

-- "¡Está listo!": arranca la votación (foto opcional del plato / trago)
create or replace function public.chef_ready(p_spin uuid, p_photo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.chef_spins%rowtype;
  me uuid;
begin
  select * into s from public.chef_spins where id = p_spin for update;
  if not found then
    raise exception 'CHEF_SPIN_NOT_FOUND';
  end if;
  me := public.require_trip_member(s.trip_id);
  if s.status <> 'cooking' then
    raise exception 'CHEF_SPIN_CLOSED';
  end if;
  if p_photo is not null and not public.valid_fresh_photo(s.trip_id, me, p_photo) then
    raise exception 'PHOTO_REQUIRED';
  end if;
  update public.chef_spins
  set status = 'voting', voting_at = now(), photo_path = p_photo
  where id = s.id;
  perform public.resolve_chef(s.id);
end;
$$;

create or replace function public.resolve_chef(p_spin uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.chef_spins%rowtype;
  t public.trips%rowtype;
  eligible int;
  good int;
  bad int;
  what text;
  ev uuid;
begin
  select * into s from public.chef_spins where id = p_spin for update;
  if s.status <> 'voting' then
    return s.status;
  end if;
  select * into t from public.trips where id = s.trip_id;
  what := case s.kind when 'comida' then 'la comida' else 'el trago' end;

  select count(*) into eligible from public.trip_members
  where trip_id = s.trip_id and user_id <> s.chosen_user_id;
  select count(*) filter (where v.good), count(*) filter (where not v.good) into good, bad
  from public.chef_votes v where v.spin_id = s.id;

  if eligible = 0 or good * 2 > eligible then
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, ref_id)
    values (
      s.trip_id, s.chosen_user_id, s.chosen_user_id, 'chef', t.chef_points, public.trip_day_for(s.trip_id),
      case s.kind when 'comida' then 'Cocinó y salió bueno' else 'Preparó un trago de 10' end,
      case s.kind when 'comida' then '👨‍🍳' else '🍹' end,
      case when s.photo_path is null then '{}'::text[] else array[s.photo_path] end,
      s.id
    );
    update public.chef_spins set status = 'good', resolved_at = now() where id = s.id;
    return 'good';
  end if;

  if bad * 2 >= eligible then
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, ref_id)
    values (
      s.trip_id, s.chosen_user_id, s.chosen_user_id, 'chef', 0, public.trip_day_for(s.trip_id),
      'No salió bueno ' || what || ': le toca prenda', '🤢',
      case when s.photo_path is null then '{}'::text[] else array[s.photo_path] end,
      s.id
    )
    returning id into ev;
    perform public.assign_forfeit(s.trip_id, s.chosen_user_id, 'chef', 'No salió bueno ' || what, ev);
    update public.chef_spins set status = 'bad', resolved_at = now() where id = s.id;
    return 'bad';
  end if;

  return 'voting';
end;
$$;

create or replace function public.vote_chef(p_spin uuid, p_good boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.chef_spins%rowtype;
  me uuid;
begin
  select * into s from public.chef_spins where id = p_spin;
  if not found then
    raise exception 'CHEF_SPIN_NOT_FOUND';
  end if;
  me := public.require_trip_member(s.trip_id);
  if s.status <> 'voting' then
    raise exception 'CHEF_SPIN_CLOSED';
  end if;
  if me = s.chosen_user_id then
    raise exception 'CANNOT_VOTE_OWN';
  end if;
  insert into public.chef_votes (spin_id, trip_id, voter_id, good)
  values (s.id, s.trip_id, me, p_good)
  on conflict (spin_id, voter_id) do update set good = excluded.good, created_at = now();
  return public.resolve_chef(s.id);
end;
$$;

-- ============================================================
-- Casino: temporizador; al terminar cada uno carga cuánto ganó o perdió
-- (con foto), el grupo lo valida y el que más ganó se lleva los puntos.
-- ============================================================

create table public.casino_sessions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  started_by uuid not null references public.profiles (id) on delete cascade,
  minutes int not null check (minutes between 5 and 600),
  prize int not null,
  status text not null default 'running' check (status in ('running', 'reporting', 'done', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  report_until timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index casino_sessions_trip_idx on public.casino_sessions (trip_id, created_at desc);

create table public.casino_players (
  session_id uuid not null references public.casino_sessions (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  amount int,
  event_id uuid references public.trip_events (id) on delete set null,
  reported_at timestamptz,
  primary key (session_id, user_id)
);

create or replace function public.format_money(p_amount int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_amount >= 0 then '+$ ' else '-$ ' end
    || replace(to_char(abs(p_amount), 'FM999,999,999,990'), ',', '.');
$$;

create or replace function public.resolve_casino(p_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.casino_sessions%rowtype;
  top int;
  pending_reports int;
  missing int;
begin
  select * into c from public.casino_sessions where id = p_session for update;
  if not found or c.status in ('done', 'cancelled') then
    return coalesce(c.status, 'missing');
  end if;

  if c.status = 'running' then
    if now() < c.ends_at then
      return 'running';
    end if;
    c.status := 'reporting';
    update public.casino_sessions set status = 'reporting' where id = c.id;
  end if;

  -- ¿Falta que alguien cargue o que se valide algún resultado?
  select count(*) into missing from public.casino_players where session_id = c.id and reported_at is null;
  select count(*) into pending_reports
  from public.casino_players p join public.trip_events e on e.id = p.event_id
  where p.session_id = c.id and e.status = 'pending';

  if (missing > 0 or pending_reports > 0) and now() < c.report_until then
    return 'reporting';
  end if;

  select max(p.amount) into top
  from public.casino_players p join public.trip_events e on e.id = p.event_id
  where p.session_id = c.id and e.status = 'approved';

  if top is not null and top > 0 then
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, ref_id)
    select c.trip_id, p.user_id, p.user_id, 'casino', c.prize, public.trip_day_for(c.trip_id),
           'Ganó el casino', '🎰', public.format_money(p.amount), c.id
    from public.casino_players p join public.trip_events e on e.id = p.event_id
    where p.session_id = c.id and e.status = 'approved' and p.amount = top;
  end if;

  update public.casino_sessions set status = 'done', resolved_at = now() where id = c.id;
  return 'done';
end;
$$;

create or replace function public.start_casino(p_trip uuid, p_minutes int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  prize int;
  new_id uuid;
begin
  if p_minutes is null or p_minutes < 5 or p_minutes > 600 then
    raise exception 'INVALID_MINUTES';
  end if;
  perform public.tick_trip(p_trip);
  if exists (select 1 from public.casino_sessions where trip_id = p_trip and status in ('running', 'reporting')) then
    raise exception 'CASINO_ACTIVE';
  end if;
  select casino_points into prize from public.trips where id = p_trip;

  insert into public.casino_sessions (trip_id, started_by, minutes, prize, ends_at, report_until)
  values (
    p_trip, me, p_minutes, prize,
    now() + make_interval(mins => p_minutes),
    now() + make_interval(mins => p_minutes + 60)
  )
  returning id into new_id;
  insert into public.casino_players (session_id, trip_id, user_id) values (new_id, p_trip, me);
  return new_id;
end;
$$;

create or replace function public.join_casino(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.casino_sessions%rowtype;
  me uuid;
begin
  select * into c from public.casino_sessions where id = p_session;
  if not found then
    raise exception 'CASINO_NOT_FOUND';
  end if;
  me := public.require_trip_member(c.trip_id);
  if c.status <> 'running' or now() >= c.ends_at then
    raise exception 'CASINO_CLOSED';
  end if;
  insert into public.casino_players (session_id, trip_id, user_id) values (c.id, c.trip_id, me)
  on conflict do nothing;
end;
$$;

create or replace function public.cancel_casino(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.casino_sessions%rowtype;
  me uuid;
begin
  select * into c from public.casino_sessions where id = p_session;
  if not found then
    raise exception 'CASINO_NOT_FOUND';
  end if;
  me := public.require_trip_member(c.trip_id);
  if c.status <> 'running' then
    raise exception 'CASINO_CLOSED';
  end if;
  if me <> c.started_by and not public.is_trip_owner(c.trip_id, me) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.casino_sessions set status = 'cancelled', resolved_at = now() where id = c.id;
end;
$$;

create or replace function public.report_casino(p_session uuid, p_amount int, p_photo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.casino_sessions%rowtype;
  me uuid;
  player public.casino_players%rowtype;
  ev uuid;
begin
  select * into c from public.casino_sessions where id = p_session;
  if not found then
    raise exception 'CASINO_NOT_FOUND';
  end if;
  me := public.require_trip_member(c.trip_id);
  perform public.resolve_casino(c.id);
  select * into c from public.casino_sessions where id = p_session;

  if c.status = 'running' then
    raise exception 'CASINO_STILL_RUNNING';
  end if;
  if c.status <> 'reporting' then
    raise exception 'CASINO_CLOSED';
  end if;

  select * into player from public.casino_players where session_id = c.id and user_id = me for update;
  if not found then
    raise exception 'CASINO_NOT_JOINED';
  end if;
  if player.reported_at is not null then
    raise exception 'CASINO_ALREADY_REPORTED';
  end if;
  if p_amount is null or p_amount < -100000000 or p_amount > 100000000 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if not public.valid_fresh_photo(c.trip_id, me, p_photo) then
    raise exception 'PHOTO_REQUIRED';
  end if;

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, photo_paths, status, ref_id)
  values (
    c.trip_id, me, me, 'casino', 0, public.trip_day_for(c.trip_id),
    'Resultado en el casino', '🎰', public.format_money(p_amount), array[p_photo], 'pending', c.id
  )
  returning id into ev;

  update public.casino_players set amount = p_amount, event_id = ev, reported_at = now()
  where session_id = c.id and user_id = me;

  perform public.resolve_event(ev);
  perform public.resolve_casino(c.id);
end;
$$;

-- ============================================================
-- Infracciones: cualquiera reporta, la mayoría valida, le toca una prenda
-- ============================================================

create or replace function public.report_infraction(
  p_trip uuid, p_user uuid, p_infraction uuid, p_photos text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  inf public.trip_infractions%rowtype;
  photos text[] := coalesce(p_photos, '{}');
  photo text;
  new_event uuid;
begin
  if not public.is_trip_member(p_trip, p_user) then
    raise exception 'NOT_TRIP_MEMBER';
  end if;
  select * into inf from public.trip_infractions
  where id = p_infraction and trip_id = p_trip and not archived;
  if not found then
    raise exception 'INFRACTION_NOT_FOUND';
  end if;
  if cardinality(photos) > 3
     or cardinality(photos) <> (select count(distinct x) from unnest(photos) as x) then
    raise exception 'PHOTO_REQUIRED';
  end if;
  foreach photo in array photos loop
    if not public.valid_fresh_photo(p_trip, me, photo) then
      raise exception 'PHOTO_REQUIRED';
    end if;
  end loop;

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, status, ref_id)
  values (p_trip, p_user, me, 'infraction', 0, public.trip_day_for(p_trip), inf.name, inf.emoji, photos, 'pending', inf.id)
  returning id into new_event;

  perform public.resolve_event(new_event);
  return new_event;
end;
$$;

-- Marcar una prenda como cumplida (foto opcional)
create or replace function public.complete_forfeit(p_forfeit uuid, p_photo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.player_forfeits%rowtype;
  me uuid := auth.uid();
begin
  select * into f from public.player_forfeits where id = p_forfeit for update;
  if not found or f.user_id <> me then
    raise exception 'FORFEIT_NOT_FOUND';
  end if;
  perform public.require_trip_member(f.trip_id);
  if f.status <> 'to_do' then
    raise exception 'FORFEIT_ALREADY_DONE';
  end if;
  if p_photo is not null and not public.valid_fresh_photo(f.trip_id, me, p_photo) then
    raise exception 'PHOTO_REQUIRED';
  end if;

  update public.player_forfeits set status = 'done', done_at = now(), photo_path = p_photo where id = f.id;
  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, photo_paths, ref_id)
  values (
    f.trip_id, me, me, 'forfeit', 0, public.trip_day_for(f.trip_id), 'Cumplió su prenda', '🙈', f.forfeit,
    case when p_photo is null then '{}'::text[] else array[p_photo] end, f.id
  );
end;
$$;

-- ============================================================
-- resolve_event: las infracciones validadas dan prenda y los resultados
-- de casino pueden cerrar la sesión
-- ============================================================

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
  result text := 'pending';
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
    result := 'approved';
    if e.kind = 'quiebre' then
      select pc.id into shield
      from public.player_cards pc
      join public.card_catalog cc on cc.key = pc.card_key
      where pc.trip_id = e.trip_id and pc.user_id = e.user_id and pc.status = 'active' and cc.effect = 'shield'
      order by pc.redeemed_at
      limit 1
      for update of pc;
    end if;

    if shield is not null then
      update public.player_cards set status = 'used', used_at = now() where id = shield;
      update public.trip_events
      set status = 'approved', resolved_at = now(), points = 0,
          title = 'Quebró, pero lo salvó el escudo', card_id = shield
      where id = p_event;
    else
      update public.trip_events set status = 'approved', resolved_at = now() where id = p_event;
    end if;

    if e.kind = 'infraction' then
      perform public.assign_forfeit(e.trip_id, e.user_id, 'infraction', e.title, e.id);
    end if;
  elsif no * 2 >= eligible then
    result := 'rejected';
    if e.kind = 'drink' and e.card_id is not null then
      update public.player_cards set status = 'active', used_at = null where id = e.card_id and status = 'used';
    end if;
    update public.trip_events set status = 'rejected', resolved_at = now() where id = p_event;
  end if;

  if result <> 'pending' and e.kind = 'casino' and e.ref_id is not null then
    perform public.resolve_casino(e.ref_id);
  end if;
  return result;
end;
$$;

-- tick_trip también cierra casinos vencidos
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
end;
$$;

-- Pendientes: se suman ruleta de cocinero, casino y prendas
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
  )
  select trip_id, count(*) from items group by trip_id;
$$;

-- ============================================================
-- Permisos y RLS
-- ============================================================

alter table public.trip_infractions enable row level security;
alter table public.trip_forfeits enable row level security;
alter table public.player_forfeits enable row level security;
alter table public.chef_spins enable row level security;
alter table public.chef_spin_players enable row level security;
alter table public.chef_votes enable row level security;
alter table public.casino_sessions enable row level security;
alter table public.casino_players enable row level security;

revoke all on public.trip_infractions, public.trip_forfeits, public.player_forfeits,
  public.chef_spins, public.chef_spin_players, public.chef_votes,
  public.casino_sessions, public.casino_players from anon, authenticated;

grant select on public.trip_infractions, public.trip_forfeits, public.player_forfeits,
  public.chef_spins, public.chef_spin_players, public.chef_votes,
  public.casino_sessions, public.casino_players to authenticated;

-- El organizador edita las listas
grant insert (trip_id, name, emoji) on public.trip_infractions to authenticated;
grant update (name, emoji, archived) on public.trip_infractions to authenticated;
grant insert (trip_id, text) on public.trip_forfeits to authenticated;
grant update (text, archived) on public.trip_forfeits to authenticated;

create policy "Ver infracciones" on public.trip_infractions for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Organizador agrega infracciones" on public.trip_infractions for insert to authenticated
  with check (public.is_trip_owner(trip_id, (select auth.uid())));
create policy "Organizador edita infracciones" on public.trip_infractions for update to authenticated
  using (public.is_trip_owner(trip_id, (select auth.uid())))
  with check (public.is_trip_owner(trip_id, (select auth.uid())));

create policy "Ver prendas" on public.trip_forfeits for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Organizador agrega prendas" on public.trip_forfeits for insert to authenticated
  with check (public.is_trip_owner(trip_id, (select auth.uid())));
create policy "Organizador edita prendas" on public.trip_forfeits for update to authenticated
  using (public.is_trip_owner(trip_id, (select auth.uid())))
  with check (public.is_trip_owner(trip_id, (select auth.uid())));

create policy "Ver prendas asignadas" on public.player_forfeits for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver ruletas de cocinero" on public.chef_spins for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver jugadores de la ruleta" on public.chef_spin_players for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver votos de cocina" on public.chef_votes for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver casinos" on public.casino_sessions for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));
create policy "Ver jugadores del casino" on public.casino_players for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

revoke execute on function
  public.seed_trip_lists(uuid),
  public.seed_trip_lists_trigger(),
  public.assign_forfeit(uuid, uuid, text, text, uuid),
  public.chef_do_spin(uuid),
  public.chef_try_spin(uuid),
  public.start_chef_spin(uuid, text),
  public.join_chef_spin(uuid),
  public.cancel_chef_spin(uuid),
  public.chef_ready(uuid, text),
  public.resolve_chef(uuid),
  public.vote_chef(uuid, boolean),
  public.format_money(int),
  public.resolve_casino(uuid),
  public.start_casino(uuid, int),
  public.join_casino(uuid),
  public.cancel_casino(uuid),
  public.report_casino(uuid, int, text),
  public.report_infraction(uuid, uuid, uuid, text[]),
  public.complete_forfeit(uuid, text),
  public.resolve_event(uuid),
  public.tick_trip(uuid),
  public.my_pending()
from public, anon, authenticated;

grant execute on function
  public.start_chef_spin(uuid, text),
  public.join_chef_spin(uuid),
  public.cancel_chef_spin(uuid),
  public.chef_ready(uuid, text),
  public.vote_chef(uuid, boolean),
  public.start_casino(uuid, int),
  public.join_casino(uuid),
  public.cancel_casino(uuid),
  public.report_casino(uuid, int, text),
  public.report_infraction(uuid, uuid, uuid, text[]),
  public.complete_forfeit(uuid, text),
  public.tick_trip(uuid),
  public.my_pending()
to authenticated;

-- >>>>>>>>>> 20261108000000_duelos.sql <<<<<<<<<<

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

-- >>>>>>>>>> 20261109000000_previa_y_salida.sql <<<<<<<<<<

-- EscabiARG: "Previa y salida" — lo mismo que un viaje, pero dura una sola jornada.
-- Ejecutar DESPUÉS de 20261108000000_duelos.sql
--
-- Antes del día: se ve pero no se puede jugar. Ese día: se juega todo igual.
-- Cuando termina la jornada: queda cerrada (se puede validar, cumplir prendas y ver
-- la galería, pero no cargar cosas nuevas).

alter table public.trips
  add column kind text not null default 'viaje' check (kind in ('viaje', 'salida'));

-- create_trip ahora recibe el tipo (se reemplaza la versión anterior)
drop function public.create_trip(text, date, text, uuid[]);

create function public.create_trip(
  p_name text,
  p_trip_date date default null,
  p_place text default null,
  p_member_ids uuid[] default '{}',
  p_kind text default 'viaje'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_trip uuid;
  members uuid[];
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'TRIP_NAME_REQUIRED';
  end if;

  if p_kind not in ('viaje', 'salida') then
    raise exception 'INVALID_KIND';
  end if;

  select coalesce(array_agg(distinct m), '{}') into members
  from unnest(coalesce(p_member_ids, '{}')) as m
  where m <> me;

  if exists (
    select 1 from unnest(members) as m where not public.are_friends(me, m)
  ) then
    raise exception 'MEMBER_NOT_FRIEND';
  end if;

  insert into public.trips (owner_id, name, trip_date, place, kind)
  values (me, trim(p_name), p_trip_date, nullif(trim(coalesce(p_place, '')), ''), p_kind)
  returning id into new_trip;

  -- Una salida sin fecha es para hoy
  if p_kind = 'salida' and p_trip_date is null then
    update public.trips set trip_date = public.trip_day_for(new_trip) where id = new_trip;
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (new_trip, me, 'owner');

  insert into public.trip_members (trip_id, user_id, role)
  select new_trip, m, 'member' from unnest(members) as m;

  return new_trip;
end;
$$;

-- 'open' (se puede jugar), 'upcoming' (salida que todavía no es hoy) o 'finished'
create or replace function public.outing_state(p_trip uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.kind <> 'salida' or t.trip_date is null then 'open'
    when public.trip_day_for(t.id) < t.trip_date then 'upcoming'
    when public.trip_day_for(t.id) > t.trip_date then 'finished'
    else 'open'
  end
  from public.trips t
  where t.id = p_trip;
$$;

-- Candado: en una salida cerrada o que no arrancó no se cargan cosas nuevas.
-- (Los resultados de lo que ya estaba en curso, las validaciones y las prendas sí.)
create or replace function public.block_closed_outing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st text := public.outing_state(new.trip_id);
begin
  if st = 'upcoming' then
    raise exception 'OUTING_NOT_STARTED';
  elsif st = 'finished' then
    raise exception 'OUTING_FINISHED';
  end if;
  return new;
end;
$$;

create trigger outing_guard_events
  before insert on public.trip_events
  for each row
  when (new.kind in ('drink', 'quiebre', 'infraction', 'mission'))
  execute function public.block_closed_outing();

create trigger outing_guard_missions
  before insert on public.daily_missions
  for each row execute function public.block_closed_outing();

create trigger outing_guard_challenges
  before insert on public.mission_challenges
  for each row execute function public.block_closed_outing();

create trigger outing_guard_chef
  before insert on public.chef_spins
  for each row execute function public.block_closed_outing();

create trigger outing_guard_casino
  before insert on public.casino_sessions
  for each row execute function public.block_closed_outing();

create trigger outing_guard_duels
  before insert on public.duels
  for each row execute function public.block_closed_outing();

revoke execute on function
  public.create_trip(text, date, text, uuid[], text),
  public.outing_state(uuid),
  public.block_closed_outing()
from public, anon, authenticated;

grant execute on function
  public.create_trip(text, date, text, uuid[], text),
  public.outing_state(uuid)
to authenticated;

-- >>>>>>>>>> 20261110000000_tiempo_real.sql <<<<<<<<<<

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

-- >>>>>>>>>> 20261111000000_quemar.sql <<<<<<<<<<

-- EscabiARG: tragos que restan y "Quemar"
--
-- 1. La carta acepta tragos que RESTAN puntos (agua, Alikal, té de boldo…): puntos negativos.
-- 2. "Quemar": le sacás una foto a alguien tomando uno de esos y, si la mayoría la valida,
--    se le restan los puntos. No te podés quemar a vos mismo.
-- 3. "Cargar trago" queda solo para los que suman.

-- ============================================================
-- Carta: tragos que restan
-- ============================================================

alter table public.trip_drinks drop constraint if exists trip_drinks_points_check;
alter table public.trip_drinks add constraint trip_drinks_points_check
  check (points between -500 and 500 and points <> 0);

-- El vaso de agua de la carta sugerida sumaba 2: ahora resta
update public.trip_drinks
set points = -5
where name = 'Vaso de agua' and emoji = '💧' and points = 2 and not archived;

-- ============================================================
-- Nuevo tipo de evento
-- ============================================================

alter table public.trip_events drop constraint trip_events_kind_check;
alter table public.trip_events add constraint trip_events_kind_check
  check (kind in ('drink', 'mission', 'quiebre', 'card', 'infraction', 'chef', 'casino', 'forfeit', 'duel', 'burn'));

-- Para revisar rápido si a alguien ya lo quemaron recién
create index if not exists trip_events_burn_idx on public.trip_events (trip_id, user_id, created_at desc)
  where kind = 'burn';

-- En una salida cerrada (o que no arrancó) tampoco se puede quemar
drop trigger if exists outing_guard_events on public.trip_events;
create trigger outing_guard_events
  before insert on public.trip_events
  for each row
  when (new.kind in ('drink', 'quiebre', 'infraction', 'mission', 'burn'))
  execute function public.block_closed_outing();

-- ============================================================
-- Cargar trago: solo los que suman
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
  -- Los que restan no se cargan solos: te tienen que quemar
  if drink.points < 0 then
    raise exception 'DRINK_IS_PENALTY';
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

-- ============================================================
-- Quemar
-- ============================================================

create or replace function public.burn_player(p_trip uuid, p_user uuid, p_drink uuid, p_photo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  drink public.trip_drinks%rowtype;
  new_event uuid;
begin
  if p_user is null or not public.is_trip_member(p_trip, p_user) then
    raise exception 'NOT_TRIP_MEMBER';
  end if;
  if p_user = me then
    raise exception 'BURN_SELF';
  end if;

  select * into drink from public.trip_drinks
  where id = p_drink and trip_id = p_trip and not archived;
  if not found then
    raise exception 'DRINK_NOT_FOUND';
  end if;
  if drink.points >= 0 then
    raise exception 'DRINK_NOT_PENALTY';
  end if;

  if not public.valid_fresh_photo(p_trip, me, p_photo) then
    raise exception 'PHOTO_REQUIRED';
  end if;

  -- Si dos la queman a la misma persona por lo mismo a la vez, cuenta una sola
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text || ':' || p_user::text, 0));
  if exists (
    select 1 from public.trip_events
    where trip_id = p_trip and user_id = p_user and kind = 'burn' and drink_id = drink.id
      and status <> 'rejected' and created_at > now() - interval '5 minutes'
  ) then
    raise exception 'BURN_RECENT';
  end if;

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, drink_id, status)
  values (p_trip, p_user, me, 'burn', drink.points, public.trip_day_for(p_trip), drink.name, drink.emoji,
          array[p_photo], drink.id, 'pending')
  returning id into new_event;

  perform public.resolve_event(new_event);
  return new_event;
end;
$$;

revoke execute on function public.burn_player(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.burn_player(uuid, uuid, uuid, text) to authenticated;

-- >>>>>>>>>> 20261112000000_viajes_y_boliche.sql <<<<<<<<<<

-- EscabiARG: eliminar viajes, sumar gente después de crearlos y "Hora boliche"

-- ============================================================
-- Eliminar un viaje / previa (solo el organizador)
-- ============================================================

-- Durante un borrado grande no se manda un aviso en vivo por cada fila
create or replace function public.rt_send(p_topic text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('escabiarg.silent', true) = 'on' then
    return;
  end if;
  perform realtime.send(p_payload, 'change', p_topic, true);
exception when others then
  raise warning 'EscabiARG realtime: %', sqlerrm;
end;
$$;

create or replace function public.delete_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  members uuid[];
  m uuid;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_trip_owner(p_trip, me) then
    raise exception 'NOT_TRIP_OWNER';
  end if;

  select coalesce(array_agg(user_id), '{}') into members
  from public.trip_members where trip_id = p_trip;

  perform set_config('escabiarg.silent', 'on', true);
  delete from public.trips where id = p_trip;
  perform set_config('escabiarg.silent', 'off', true);

  -- Un solo aviso: a los que están adentro del viaje y al inicio de cada uno
  perform public.rt_send(
    'trip:' || p_trip,
    jsonb_build_object('t', 'trips', 'op', 'DELETE', 'row', jsonb_build_object('id', p_trip))
  );
  foreach m in array members loop
    perform public.rt_send(
      'user:' || m,
      jsonb_build_object('t', 'trip_members', 'op', 'DELETE',
                         'row', jsonb_build_object('trip_id', p_trip, 'user_id', m))
    );
  end loop;
end;
$$;

-- El organizador puede borrar las fotos del viaje (la app las borra antes de eliminarlo)
create or replace function public.is_trip_owner_text(p_trip text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips where id::text = p_trip and owner_id = p_user
  );
$$;

drop policy if exists "El organizador borra las fotos del viaje" on storage.objects;
create policy "El organizador borra las fotos del viaje"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-photos'
    and public.is_trip_owner_text((storage.foldername(name))[1], (select auth.uid()))
  );

-- ============================================================
-- Sumar gente a un viaje ya creado (solo el organizador, solo amigos)
-- ============================================================

create or replace function public.add_trip_members(p_trip uuid, p_member_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  members uuid[];
  added int;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_trip_owner(p_trip, me) then
    raise exception 'NOT_TRIP_OWNER';
  end if;

  select coalesce(array_agg(distinct m), '{}') into members
  from unnest(coalesce(p_member_ids, '{}')) as m
  where m <> me
    and not exists (select 1 from public.trip_members t where t.trip_id = p_trip and t.user_id = m);

  if cardinality(members) = 0 then
    raise exception 'NO_NEW_MEMBERS';
  end if;
  if exists (select 1 from unnest(members) as m where not public.are_friends(me, m)) then
    raise exception 'MEMBER_NOT_FRIEND';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  select p_trip, m, 'member' from unnest(members) as m
  on conflict do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke execute on function
  public.delete_trip(uuid),
  public.add_trip_members(uuid, uuid[]),
  public.is_trip_owner_text(text, uuid)
from public, anon, authenticated;

grant execute on function
  public.delete_trip(uuid),
  public.add_trip_members(uuid, uuid[]),
  public.is_trip_owner_text(text, uuid)
to authenticated;

-- ============================================================
-- Hora boliche
-- La activa (y la termina) el organizador. Mientras dura, las misiones, las
-- infracciones, las prendas y los duelos son de boliche.
-- ============================================================

alter table public.trips add column if not exists boliche_at timestamptz;

alter table public.mission_catalog
  add column if not exists theme text not null default 'normal' check (theme in ('normal', 'boliche'));
alter table public.daily_missions
  add column if not exists theme text not null default 'normal' check (theme in ('normal', 'boliche'));
alter table public.trip_infractions
  add column if not exists theme text not null default 'normal' check (theme in ('normal', 'boliche'));
alter table public.trip_forfeits
  add column if not exists theme text not null default 'normal' check (theme in ('normal', 'boliche'));

grant insert (theme) on public.trip_infractions, public.trip_forfeits to authenticated;

-- 'boliche' mientras está activada la Hora boliche
create or replace function public.trip_theme(p_trip uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when boliche_at is not null then 'boliche' else 'normal' end
  from public.trips where id = p_trip;
$$;

create or replace function public.set_boliche(p_trip uuid, p_on boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  st text;
  result timestamptz;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_trip_owner(p_trip, me) then
    raise exception 'NOT_TRIP_OWNER';
  end if;
  if p_on then
    st := public.outing_state(p_trip);
    if st = 'upcoming' then
      raise exception 'OUTING_NOT_STARTED';
    elsif st = 'finished' then
      raise exception 'OUTING_FINISHED';
    end if;
  end if;

  update public.trips
  set boliche_at = case when p_on then coalesce(boliche_at, now()) else null end
  where id = p_trip
  returning boliche_at into result;
  return result;
end;
$$;

-- ---------- Misiones de boliche ----------

insert into public.mission_catalog (difficulty, mission, theme)
select v.difficulty, v.mission, 'boliche'
from (values
  ('easy', 'Sacate una selfie con todo el grupo en la pista.'),
  ('easy', 'Pedile al DJ un tema de cumbia.'),
  ('easy', 'Bailá un tema entero sin parar (y sin mirar el celu).'),
  ('easy', 'Aprendete el nombre de quien atiende la barra y saludalo/a por su nombre.'),
  ('easy', 'Conseguí que alguien del grupo te invite un trago.'),
  ('easy', 'Hacé un brindis en la barra con alguien que no conocías.'),
  ('easy', 'Cantá el estribillo de un tema a los gritos con el grupo.'),
  ('medium', 'Armá un trencito de al menos 5 personas.'),
  ('medium', 'Hacé la coreo completa de un tema que elija el grupo.'),
  ('medium', 'Conseguí una foto con alguien que tenga algo que brille.'),
  ('medium', 'Chamuyá a alguien en la barra y conseguí su Instagram.'),
  ('medium', 'Bailá en el medio de una ronda que arme el grupo.'),
  ('medium', 'Conseguí que el DJ te salude o te haga un gesto.'),
  ('medium', 'Enseñale un paso de baile a alguien que no conocés.'),
  ('extreme', 'Conseguí que el DJ pase un tema que pidió el grupo.'),
  ('extreme', 'Invitá a alguien que no conocés a bailar un tema (y que acepte).'),
  ('extreme', 'Hacé que una ronda de desconocidos cante un estribillo con vos.'),
  ('extreme', 'Volvé de la barra con un trago que te invitó alguien que no es del grupo.'),
  ('extreme', 'Conseguí que te presten un gorro o unos anteojos y bailá un tema con eso puesto.'),
  ('extreme', 'Sacate una foto con alguien del staff del boliche (pidiéndolo bien).')
) as v(difficulty, mission)
where not exists (
  select 1 from public.mission_catalog c where c.mission = v.mission and c.theme = 'boliche'
);

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
  v_theme text := public.trip_theme(p_trip);
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
  where difficulty = p_difficulty and theme = v_theme
  order by random()
  limit 1;

  insert into public.daily_missions (trip_id, user_id, day, difficulty, mission, points, theme)
  values (p_trip, me, today, p_difficulty, picked, pts, v_theme)
  returning id into new_id;

  return new_id;
end;
$$;

-- Ya tenías misión cuando arrancó la Hora boliche: la podés cambiar por una de boliche (una vez)
create or replace function public.swap_boliche_mission(p_trip uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_trip_member(p_trip);
  m public.daily_missions%rowtype;
  picked text;
begin
  if public.trip_theme(p_trip) <> 'boliche' then
    raise exception 'BOLICHE_OFF';
  end if;

  select * into m from public.daily_missions
  where trip_id = p_trip and user_id = me and day = public.trip_day_for(p_trip)
  for update;
  if not found then
    raise exception 'MISSION_NOT_FOUND';
  end if;
  if m.completed_at is not null then
    raise exception 'MISSION_ALREADY_DONE';
  end if;
  if m.theme = 'boliche' or m.group_assigned then
    raise exception 'MISSION_NOT_SWAPPABLE';
  end if;
  if exists (
    select 1 from public.mission_challenges
    where mission_id = m.id and phase in ('vote_bad', 'proposals', 'vote_option')
  ) then
    raise exception 'MISSION_UNDER_VOTE';
  end if;

  select mission into picked from public.mission_catalog
  where difficulty = m.difficulty and theme = 'boliche'
  order by random()
  limit 1;

  update public.daily_missions set mission = picked, theme = 'boliche' where id = m.id;
  return picked;
end;
$$;

-- ---------- Infracciones y prendas de boliche ----------

create or replace function public.seed_boliche_lists(p_trip uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.trip_infractions (trip_id, emoji, name, theme) values
    (p_trip, '🧭', 'Perderse del grupo en el boliche', 'boliche'),
    (p_trip, '🛋️', 'Quedarse sentado en un sillón toda la noche', 'boliche'),
    (p_trip, '🎟️', 'Perder la ficha del guardarropa', 'boliche'),
    (p_trip, '🏃', 'Irse sin avisar', 'boliche'),
    (p_trip, '📱', 'Bailar mirando el celular', 'boliche'),
    (p_trip, '😴', 'Dormirse en el boliche', 'boliche'),
    (p_trip, '🧥', 'Volver sin la campera', 'boliche'),
    (p_trip, '🚫', 'Quedarse afuera en la fila', 'boliche');

  insert into public.trip_forfeits (trip_id, text, theme) values
    (p_trip, 'Bailar solo en el medio de la pista un tema entero.', 'boliche'),
    (p_trip, 'Ir a la barra a buscar agua para todo el grupo.', 'boliche'),
    (p_trip, 'Hacer el paso de baile que elija el grupo durante todo un tema.', 'boliche'),
    (p_trip, 'Pedirle al DJ un tema de Arjona.', 'boliche'),
    (p_trip, 'Usar anteojos de sol adentro del boliche por media hora.', 'boliche'),
    (p_trip, 'Buscar las camperas de todos en el guardarropa a la salida.', 'boliche'),
    (p_trip, 'Gritar "¡dale campeón!" cada vez que el DJ cambie de tema (por 15 minutos).', 'boliche'),
    (p_trip, 'Invitarle un trago a quien elija el grupo.', 'boliche'),
    (p_trip, 'Bailar el próximo lento con quien elija el grupo (del grupo).', 'boliche'),
    (p_trip, 'Hacer de fotógrafo oficial del grupo por media hora.', 'boliche');
$$;

create or replace function public.seed_trip_lists_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_trip_lists(new.id);
  perform public.seed_boliche_lists(new.id);
  return new;
end;
$$;

-- Viajes que ya existían
select public.seed_boliche_lists(t.id)
from public.trips t
where not exists (
  select 1 from public.trip_forfeits f where f.trip_id = t.id and f.theme = 'boliche'
);

-- La prenda que toca sale de la lista de boliche si está activada (si está vacía, de la normal)
create or replace function public.assign_forfeit(
  p_trip uuid, p_user uuid, p_source text, p_reason text, p_event uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_theme text := public.trip_theme(p_trip);
  picked text;
  new_id uuid;
begin
  select text into picked from public.trip_forfeits
  where trip_id = p_trip and not archived
  order by (theme = v_theme) desc, random()
  limit 1;

  insert into public.player_forfeits (trip_id, user_id, source, reason, forfeit, event_id)
  values (p_trip, p_user, p_source, p_reason, coalesce(picked, 'Lavar los platos de todos.'), p_event)
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------- Duelo de baile (solo en Hora boliche) ----------
-- Bailan los dos el tiempo elegido y después vota el resto del grupo quién ganó.

alter table public.duels drop constraint if exists duels_kind_check;
alter table public.duels add constraint duels_kind_check check (kind in ('fondo', 'shots', 'baile'));
alter table public.duels drop constraint if exists duels_status_check;
alter table public.duels add constraint duels_status_check
  check (status in ('invited', 'declined', 'live', 'voting', 'done', 'cancelled'));
alter table public.duels add column if not exists voting_until timestamptz;

create table if not exists public.duel_votes (
  duel_id uuid not null references public.duels (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  pick uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (duel_id, voter_id)
);

create index if not exists duel_votes_trip_idx on public.duel_votes (trip_id);

alter table public.duel_votes enable row level security;
revoke all on public.duel_votes from anon, authenticated;
grant select on public.duel_votes to authenticated;
drop policy if exists "Ver votos de duelos de baile" on public.duel_votes;
create policy "Ver votos de duelos de baile" on public.duel_votes for select to authenticated
  using (public.is_trip_member(trip_id, (select auth.uid())));

drop trigger if exists broadcast_change on public.duel_votes;
create trigger broadcast_change
  after insert or update or delete on public.duel_votes
  for each row execute function public.broadcast_trip_change();

-- Se llama desde resolve_duel (que ya bloqueó la fila del duelo)
create or replace function public.resolve_dance(p_duel uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.duels%rowtype;
  a public.duel_results%rowtype;
  b public.duel_results%rowtype;
  eligible int;
  votes_a int;
  votes_b int;
  winner uuid;
  loser uuid;
  detail text;
  decided boolean := false;
  ev uuid;
begin
  select * into d from public.duels where id = p_duel;
  if d.status not in ('live', 'voting') then
    return d.status;
  end if;
  select * into a from public.duel_results where duel_id = d.id and user_id = d.challenger_id;
  select * into b from public.duel_results where duel_id = d.id and user_id = d.opponent_id;

  if d.status = 'live' then
    if a.gave_up or b.gave_up then
      if a.gave_up and not b.gave_up then
        winner := b.user_id;
      elsif b.gave_up and not a.gave_up then
        winner := a.user_id;
      end if;
      detail := 'El otro se bajó de la pista';
      decided := true;
    elsif now() < d.ends_at then
      return 'live';
    else
      d.voting_until := d.ends_at + interval '90 seconds';
      d.status := 'voting';
      update public.duels set status = 'voting', voting_until = d.voting_until where id = d.id;
    end if;
  end if;

  if not decided then
    select count(*) into eligible
    from public.trip_members m
    where m.trip_id = d.trip_id and m.user_id <> d.challenger_id and m.user_id <> d.opponent_id;

    select count(*) filter (where v.pick = d.challenger_id), count(*) filter (where v.pick = d.opponent_id)
    into votes_a, votes_b
    from public.duel_votes v where v.duel_id = d.id;

    if eligible > 0 and votes_a + votes_b < eligible and now() < d.voting_until then
      return 'voting';
    end if;

    if votes_a > votes_b then
      winner := d.challenger_id;
    elsif votes_b > votes_a then
      winner := d.opponent_id;
    end if;
    detail := case
      when eligible = 0 then 'No había nadie para votar'
      when votes_a + votes_b = 0 then 'Nadie votó'
      else greatest(votes_a, votes_b) || ' a ' || least(votes_a, votes_b) || ' en la votación'
    end;
  end if;

  if winner is not null then
    loser := case when winner = d.challenger_id then d.opponent_id else d.challenger_id end;
    -- Ya lo decidió el grupo con los votos: entra validado
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, status, resolved_at, ref_id)
    select d.trip_id, winner, loser, 'duel', t.duel_points, d.day, 'Ganó el duelo de baile', '🕺', detail, 'approved', now(), d.id
    from public.trips t where t.id = d.trip_id
    returning id into ev;
  end if;

  update public.duels set status = 'done', winner_id = winner, event_id = ev, resolved_at = now() where id = d.id;
  return 'done';
end;
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
  if d.kind = 'baile' then
    return public.resolve_dance(d.id);
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
  if p_kind not in ('fondo', 'shots', 'baile') then
    raise exception 'INVALID_KIND';
  end if;
  if p_kind = 'baile' and public.trip_theme(p_trip) <> 'boliche' then
    raise exception 'BOLICHE_ONLY';
  end if;
  if p_kind = 'fondo' and (p_seconds < 10 or p_seconds > 120) then
    raise exception 'INVALID_SECONDS';
  end if;
  if p_kind = 'shots' and (p_seconds < 30 or p_seconds > 300) then
    raise exception 'INVALID_SECONDS';
  end if;
  if p_kind = 'baile' and (p_seconds < 30 or p_seconds > 180) then
    raise exception 'INVALID_SECONDS';
  end if;

  perform public.resolve_due(p_trip);

  if exists (
    select 1 from public.duels
    where trip_id = p_trip and status in ('invited', 'live', 'voting')
      and (challenger_id in (me, p_opponent) or opponent_id in (me, p_opponent))
  ) then
    raise exception 'DUEL_BUSY';
  end if;

  if (select count(*) from public.duels
      where trip_id = p_trip and day = today and status in ('live', 'voting', 'done')
        and (challenger_id = me or opponent_id = me)) >= 3 then
    raise exception 'DUEL_LIMIT_ME';
  end if;
  if (select count(*) from public.duels
      where trip_id = p_trip and day = today and status in ('live', 'voting', 'done')
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
      where trip_id = d.trip_id and day = d.day and status in ('live', 'voting', 'done')
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

create or replace function public.vote_duel(p_duel uuid, p_pick uuid)
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
  if d.kind <> 'baile' then
    raise exception 'INVALID_KIND';
  end if;
  if me = d.challenger_id or me = d.opponent_id then
    raise exception 'CANNOT_VOTE_OWN';
  end if;
  if d.status = 'live' then
    raise exception 'DUEL_STILL_DANCING';
  end if;
  if d.status <> 'voting' then
    raise exception 'DUEL_CLOSED';
  end if;
  if p_pick is null or p_pick not in (d.challenger_id, d.opponent_id) then
    raise exception 'INVALID_OPPONENT';
  end if;

  insert into public.duel_votes (duel_id, trip_id, voter_id, pick)
  values (d.id, d.trip_id, me, p_pick)
  on conflict (duel_id, voter_id) do update set pick = excluded.pick, created_at = now();

  return public.resolve_duel(d.id);
end;
$$;

-- tick: también cierra las votaciones de baile vencidas
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
        or (status = 'voting' and voting_until <= now())
      )
  loop
    perform public.resolve_duel(cid);
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- Pendientes: se suman las votaciones de los duelos de baile
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
    union all
    select d.trip_id from public.duels d, me
    where d.trip_id in (select trip_id from my_trips) and d.kind = 'baile'
      and me.id <> d.challenger_id and me.id <> d.opponent_id
      and (d.status = 'voting' or (d.status = 'live' and d.ends_at <= now()))
      and coalesce(d.voting_until, d.ends_at + interval '90 seconds') > now()
      and not exists (select 1 from public.duel_votes v where v.duel_id = d.id and v.voter_id = me.id)
  )
  select trip_id, count(*) from items group by trip_id;
$$;

-- La lectura del viaje trae también los votos de los duelos de baile
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
    'duelVotes', coalesce((
      select jsonb_agg(to_jsonb(x) - 'trip_id') from public.duel_votes x where x.trip_id = p_trip
    ), '[]'::jsonb),
    'serverTime', to_jsonb(clock_timestamp())
  ) into result;

  return result;
end;
$$;

-- ============================================================
-- Permisos
-- ============================================================

revoke execute on function
  public.trip_theme(uuid),
  public.set_boliche(uuid, boolean),
  public.swap_boliche_mission(uuid),
  public.seed_boliche_lists(uuid),
  public.resolve_dance(uuid),
  public.vote_duel(uuid, uuid),
  public.resolve_due(uuid),
  public.my_pending(),
  public.get_trip_state(uuid)
from public, anon, authenticated;

grant execute on function
  public.set_boliche(uuid, boolean),
  public.swap_boliche_mission(uuid),
  public.vote_duel(uuid, uuid),
  public.my_pending(),
  public.get_trip_state(uuid)
to authenticated;

commit;
