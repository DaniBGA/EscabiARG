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
