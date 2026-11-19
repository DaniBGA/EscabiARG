-- EscabiARG: módulos opcionales y fechas del viaje
--
-- 1. Al crear un viaje o una previa se eligen los extras que se juegan:
--      missions  → misiones del día
--      duels     → duelos (fondo blanco, shots, baile)
--      casino    → salida al casino
--      chef      → ruleta de quién cocina / prepara el trago
--      boliche   → Hora boliche
--    Lo fundamental está siempre: cargar trago, quemar, alguien quebró e
--    infracciones (con sus prendas).
--    Los viajes que ya existían quedan con todo activado.
--    La base rechaza lo que esté apagado (FEATURE_OFF), no solo la pantalla.
--    El organizador los puede cambiar después (set_trip_features).
--
-- 2. Los viajes tienen fecha de inicio (trip_date) y de fin (end_date).

alter table public.trips
  add column if not exists features text[] not null
    default array['missions', 'duels', 'casino', 'chef', 'boliche'],
  add column if not exists end_date date;

alter table public.trips drop constraint if exists trips_features_check;
alter table public.trips add constraint trips_features_check
  check (features <@ array['missions', 'duels', 'casino', 'chef', 'boliche']);

alter table public.trips drop constraint if exists trips_end_date_check;
alter table public.trips add constraint trips_end_date_check
  check (end_date is null or (trip_date is not null and end_date >= trip_date and end_date <= trip_date + 60));

-- ---------- ¿Este viaje tiene el módulo? ----------

create or replace function public.trip_has_feature(p_trip uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p_feature = any (features) from public.trips where id = p_trip), false);
$$;

revoke execute on function public.trip_has_feature(uuid, text) from public, anon;
grant execute on function public.trip_has_feature(uuid, text) to authenticated;

-- Guardia genérica: se usa con el nombre del módulo como argumento del trigger
create or replace function public.require_trip_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.trip_has_feature(new.trip_id, tg_argv[0]) then
    raise exception 'FEATURE_OFF';
  end if;
  return new;
end;
$$;

revoke execute on function public.require_trip_feature() from public, anon, authenticated;

drop trigger if exists feature_missions on public.daily_missions;
create trigger feature_missions before insert on public.daily_missions
  for each row execute function public.require_trip_feature('missions');

drop trigger if exists feature_missions on public.mission_challenges;
create trigger feature_missions before insert on public.mission_challenges
  for each row execute function public.require_trip_feature('missions');

drop trigger if exists feature_duels on public.duels;
create trigger feature_duels before insert on public.duels
  for each row execute function public.require_trip_feature('duels');

drop trigger if exists feature_casino on public.casino_sessions;
create trigger feature_casino before insert on public.casino_sessions
  for each row execute function public.require_trip_feature('casino');

drop trigger if exists feature_chef on public.chef_spins;
create trigger feature_chef before insert on public.chef_spins
  for each row execute function public.require_trip_feature('chef');

-- Hora boliche: no se puede prender si el viaje no la tiene
create or replace function public.require_boliche_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.boliche_at is not null and old.boliche_at is null
     and not ('boliche' = any (new.features)) then
    raise exception 'FEATURE_OFF';
  end if;
  return new;
end;
$$;

revoke execute on function public.require_boliche_feature() from public, anon, authenticated;

drop trigger if exists feature_boliche on public.trips;
create trigger feature_boliche before update of boliche_at on public.trips
  for each row execute function public.require_boliche_feature();

-- ---------- Crear viaje: con módulos y fecha de fin ----------

drop function if exists public.create_trip(text, date, text, uuid[], text);

create or replace function public.create_trip(
  p_name text,
  p_trip_date date default null,
  p_place text default null,
  p_member_ids uuid[] default '{}',
  p_kind text default 'viaje',
  p_features text[] default null,
  p_end_date date default null
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
  v_features text[];
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

  -- Sin elegir (versiones viejas de la app): todo activado
  v_features := case
    when p_features is null then array['missions', 'duels', 'casino', 'chef', 'boliche']
    else array(select distinct f from unnest(p_features) as f order by f)
  end;
  if not (v_features <@ array['missions', 'duels', 'casino', 'chef', 'boliche']) then
    raise exception 'INVALID_FEATURES';
  end if;

  -- La fecha de fin es solo para viajes, y no puede ser antes del inicio
  if p_end_date is not null and (
    p_kind = 'salida' or p_trip_date is null or p_end_date < p_trip_date or p_end_date > p_trip_date + 60
  ) then
    raise exception 'INVALID_DATES';
  end if;

  select coalesce(array_agg(distinct m), '{}') into members
  from unnest(coalesce(p_member_ids, '{}')) as m
  where m <> me;

  if exists (
    select 1 from unnest(members) as m where not public.are_friends(me, m)
  ) then
    raise exception 'MEMBER_NOT_FRIEND';
  end if;

  insert into public.trips (owner_id, name, trip_date, end_date, place, kind, features)
  values (me, trim(p_name), p_trip_date, p_end_date, nullif(trim(coalesce(p_place, '')), ''), p_kind, v_features)
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

revoke execute on function public.create_trip(text, date, text, uuid[], text, text[], date) from public, anon, authenticated;
grant execute on function public.create_trip(text, date, text, uuid[], text, text[], date) to authenticated;

-- ---------- El organizador cambia los módulos o las fechas ----------

create or replace function public.set_trip_features(p_trip uuid, p_features text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_features text[];
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_trip_owner(p_trip, auth.uid()) then
    raise exception 'NOT_TRIP_OWNER';
  end if;
  v_features := array(select distinct f from unnest(coalesce(p_features, '{}')) as f order by f);
  if not (v_features <@ array['missions', 'duels', 'casino', 'chef', 'boliche']) then
    raise exception 'INVALID_FEATURES';
  end if;
  -- Si se apaga la Hora boliche estando prendida, se termina
  update public.trips
  set features = v_features,
      boliche_at = case when 'boliche' = any (v_features) then boliche_at else null end
  where id = p_trip;
end;
$$;

create or replace function public.set_trip_dates(p_trip uuid, p_start date, p_end date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_trip_owner(p_trip, auth.uid()) then
    raise exception 'NOT_TRIP_OWNER';
  end if;
  select kind into v_kind from public.trips where id = p_trip;
  if v_kind = 'salida' and (p_end is not null or p_start is null) then
    raise exception 'INVALID_DATES';
  end if;
  if p_end is not null and (p_start is null or p_end < p_start or p_end > p_start + 60) then
    raise exception 'INVALID_DATES';
  end if;
  update public.trips set trip_date = p_start, end_date = p_end where id = p_trip;
end;
$$;

revoke execute on function public.set_trip_features(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.set_trip_dates(uuid, date, date) from public, anon, authenticated;
grant execute on function public.set_trip_features(uuid, text[]) to authenticated;
grant execute on function public.set_trip_dates(uuid, date, date) to authenticated;
