-- EscabiARG: casino con "Quedé en 0"
--
-- Mientras dura el casino, cada uno que pierde toda la plata toca "Quedé en 0".
--   · Si quedan todos en 0 menos uno, ese gana al instante (no hace falta foto).
--   · Si se termina el tiempo y quedan varios con plata, solo el ganador sube
--     la foto de cuánta plata le quedó y el resto del grupo lo valida.
--     Si no lo validan, puede reclamarlo otro de los que siguen con plata.

alter table public.casino_players add column if not exists busted_at timestamptz;

create or replace function public.resolve_casino(p_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.casino_sessions%rowtype;
  total int;
  alive int;
  last_one uuid;
  claim_status text;
begin
  select * into c from public.casino_sessions where id = p_session for update;
  if not found or c.status in ('done', 'cancelled') then
    return coalesce(c.status, 'missing');
  end if;

  select count(*), count(*) filter (where busted_at is null) into total, alive
  from public.casino_players where session_id = c.id;

  -- El último que queda con plata gana al toque
  if total >= 2 and alive = 1 then
    select user_id into last_one from public.casino_players where session_id = c.id and busted_at is null;
    insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, status, resolved_at, ref_id)
    values (c.trip_id, last_one, last_one, 'casino', c.prize, public.trip_day_for(c.trip_id),
            'Ganó el casino', '🎰', 'Fue el último que quedó con plata 🤑', 'approved', now(), c.id);
    update public.casino_sessions set status = 'done', resolved_at = now() where id = c.id;
    return 'done';
  end if;

  -- Quedaron todos en 0: nadie gana
  if total >= 1 and alive = 0 then
    update public.casino_sessions set status = 'done', resolved_at = now() where id = c.id;
    return 'done';
  end if;

  if c.status = 'running' then
    if now() < c.ends_at then
      return 'running';
    end if;
    update public.casino_sessions set status = 'reporting' where id = c.id;
  end if;

  -- Terminado el tiempo: ¿ya validaron al ganador?
  select e.status into claim_status
  from public.casino_players p join public.trip_events e on e.id = p.event_id
  where p.session_id = c.id and e.points > 0 and e.status in ('approved', 'pending')
  order by e.status = 'approved' desc
  limit 1;

  if claim_status = 'approved' then
    update public.casino_sessions set status = 'done', resolved_at = now() where id = c.id;
    return 'done';
  end if;
  if now() >= c.report_until then
    update public.casino_sessions set status = 'done', resolved_at = now() where id = c.id;
    return 'done';
  end if;
  return 'reporting';
end;
$$;

-- "Quedé en 0": perdiste toda la plata y quedás afuera
create or replace function public.bust_casino(p_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.casino_sessions%rowtype;
  me uuid;
  player public.casino_players%rowtype;
begin
  select * into c from public.casino_sessions where id = p_session;
  if not found then
    raise exception 'CASINO_NOT_FOUND';
  end if;
  me := public.require_trip_member(c.trip_id);
  perform public.resolve_casino(c.id);
  select * into c from public.casino_sessions where id = p_session;
  if c.status <> 'running' then
    raise exception 'CASINO_CLOSED';
  end if;
  select * into player from public.casino_players where session_id = c.id and user_id = me for update;
  if not found then
    raise exception 'CASINO_NOT_JOINED';
  end if;
  if player.busted_at is not null then
    raise exception 'CASINO_ALREADY_BUSTED';
  end if;
  update public.casino_players set busted_at = now() where session_id = c.id and user_id = me;
  return public.resolve_casino(c.id);
end;
$$;

-- Terminado el tiempo: el ganador sube la foto de cuánta plata le quedó
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
  if player.busted_at is not null then
    raise exception 'CASINO_BUSTED';
  end if;
  if player.reported_at is not null then
    raise exception 'CASINO_ALREADY_REPORTED';
  end if;
  if exists (
    select 1 from public.casino_players q join public.trip_events e on e.id = q.event_id
    where q.session_id = c.id and e.points > 0 and e.status in ('pending', 'approved')
  ) then
    raise exception 'CASINO_CLAIM_PENDING';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if not public.valid_fresh_photo(c.trip_id, me, p_photo) then
    raise exception 'PHOTO_REQUIRED';
  end if;

  -- El reclamo ya es el premio: si el grupo lo valida, suma
  insert into public.trip_events (trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, photo_paths, status, ref_id)
  values (
    c.trip_id, me, me, 'casino', c.prize, public.trip_day_for(c.trip_id),
    'Ganó el casino', '🎰', 'Le quedaron ' || replace(public.format_money(p_amount), '+', ''), array[p_photo], 'pending', c.id
  )
  returning id into ev;

  update public.casino_players set amount = p_amount, event_id = ev, reported_at = now()
  where session_id = c.id and user_id = me;

  perform public.resolve_event(ev);
  perform public.resolve_casino(c.id);
end;
$$;

-- Pendientes: el resultado del casino lo carga solo quien sigue con plata
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
    where p.user_id = me.id and p.reported_at is null and p.busted_at is null
      and (c.status = 'reporting' or (c.status = 'running' and c.ends_at <= now()))
      and c.report_until > now()
      -- Si alguien ya dijo que ganó, no hace falta que lo cargues vos
      and not exists (
        select 1 from public.casino_players q join public.trip_events e on e.id = q.event_id
        where q.session_id = c.id and e.points > 0 and e.status in ('pending', 'approved')
      )
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

revoke execute on function public.bust_casino(uuid) from public, anon, authenticated;
grant execute on function public.bust_casino(uuid) to authenticated;
revoke execute on function public.resolve_casino(uuid) from public, anon, authenticated;
