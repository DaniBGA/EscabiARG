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
