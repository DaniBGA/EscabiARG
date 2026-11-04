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
