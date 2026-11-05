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
