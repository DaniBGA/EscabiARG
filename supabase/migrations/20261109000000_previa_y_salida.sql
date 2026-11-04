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
