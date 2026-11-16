-- EscabiARG: la prenda de una infracción la puede elegir o escribir quien la reporta
--
-- Al reportar una infracción se puede:
--   · escribir la prenda a mano,
--   · elegir una de las cargadas en la lista del viaje, o
--   · dejar que toque una al azar (como antes).
-- La prenda elegida se guarda en el evento y se asigna cuando la mayoría valida.

alter table public.trip_events add column if not exists forfeit_text text
  check (forfeit_text is null or char_length(forfeit_text) between 3 and 140);

drop function if exists public.report_infraction(uuid, uuid, uuid, text[]);

create or replace function public.report_infraction(
  p_trip uuid, p_user uuid, p_infraction uuid, p_photos text[] default '{}', p_forfeit text default null
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
  forfeit text := nullif(trim(coalesce(p_forfeit, '')), '');
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
  if forfeit is not null and char_length(forfeit) not between 3 and 140 then
    raise exception 'FORFEIT_INVALID';
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

  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, photo_paths, status, ref_id, forfeit_text)
  values (p_trip, p_user, me, 'infraction', 0, public.trip_day_for(p_trip), inf.name, inf.emoji, photos, 'pending', inf.id, forfeit)
  returning id into new_event;

  perform public.resolve_event(new_event);
  return new_event;
end;
$$;

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

    if e.kind = 'infraction' and e.forfeit_text is not null then
      -- La prenda la eligió o la escribió quien reportó la infracción
      insert into public.player_forfeits (trip_id, user_id, source, reason, forfeit, event_id)
      values (e.trip_id, e.user_id, 'infraction', e.title, e.forfeit_text, e.id);
    elsif e.kind = 'infraction' then
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

revoke execute on function public.report_infraction(uuid, uuid, uuid, text[], text) from public, anon, authenticated;
grant execute on function public.report_infraction(uuid, uuid, uuid, text[], text) to authenticated;
revoke execute on function public.resolve_event(uuid) from public, anon, authenticated;
