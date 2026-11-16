-- EscabiARG: notificaciones
--
-- Cuando pasa algo en un viaje (te desafían, te queman, hay algo para votar,
-- arranca la Hora boliche...) la base arma el aviso para cada jugador.
--   * Con la app abierta (o en otra pestaña) el aviso llega por el tiempo real
--     y el navegador lo muestra como notificación.
--   * Con el navegador cerrado o el celular bloqueado llega por Web Push: lo
--     manda la función "push" (supabase/functions/push) a los celulares que
--     activaron las notificaciones.
-- Nadie puede leer los avisos de otro; los celulares suscriptos solo los ve
-- el servidor.

-- ---------- Avisos ----------

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete cascade,
  title text not null,
  body text not null,
  -- Avisos con la misma etiqueta se reemplazan (ej: "hay cosas para votar")
  tag text not null,
  url text not null default '',
  created_at timestamptz not null default now(),
  pushed_at timestamptz
);

create index if not exists notifications_unpushed_idx on public.notifications (id) where pushed_at is null;
create index if not exists notifications_created_idx on public.notifications (created_at);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

drop policy if exists "Ver mis avisos" on public.notifications;
create policy "Ver mis avisos" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Celulares suscriptos a Web Push ----------

create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 10 and 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
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
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then
    raise exception 'PUSH_INVALID';
  end if;
  -- Un celular es de una sola cuenta: si cambió de cuenta, pasa a la nueva
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, me, p_p256dh, p_auth)
  on conflict (endpoint) do update
  set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- Hasta 10 celulares/navegadores por persona
  delete from public.push_subscriptions
  where user_id = me and endpoint in (
    select endpoint from public.push_subscriptions where user_id = me
    order by created_at desc offset 10
  );
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon, authenticated;
revoke execute on function public.delete_push_subscription(text) from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Solo para la función "push" (usa la clave de servidor): toma los avisos
-- nuevos y los devuelve con los celulares a los que hay que mandarlos.
create or replace function public.claim_push_batch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  with batch as (
    update public.notifications n
    set pushed_at = now()
    where n.id in (
      select id from public.notifications
      where pushed_at is null
      order by id
      limit 300
      for update skip locked
    )
    returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint,
    'p256dh', s.p256dh,
    'auth', s.auth,
    'payload', jsonb_build_object(
      'id', b.id, 'title', b.title, 'body', b.body, 'tag', b.tag, 'url', b.url, 'trip', b.trip_id
    )
  ) order by b.id), '[]'::jsonb)
  into result
  from batch b
  join public.push_subscriptions s on s.user_id = b.user_id
  -- Un aviso viejo ya no sirve (ej: la función estuvo apagada)
  where b.created_at > now() - interval '15 minutes';

  delete from public.notifications where created_at < now() - interval '3 days';
  return result;
end;
$$;

-- El celular ya no existe (desinstalaron, borraron datos): se olvida
create or replace function public.drop_push_subscriptions(p_endpoints text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
$$;

revoke execute on function public.claim_push_batch() from public, anon, authenticated;
revoke execute on function public.drop_push_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.claim_push_batch() to service_role;
grant execute on function public.drop_push_subscriptions(text[]) to service_role;

-- ---------- Armar avisos ----------

create or replace function public.notif_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select display_name from public.profiles where id = p_user), 'Alguien');
$$;

-- Manda el mismo aviso a varios jugadores del viaje
create or replace function public.notify_users(p_users uuid[], p_trip uuid, p_body text, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if current_setting('escabiarg.silent', true) = 'on' or p_users is null or cardinality(p_users) = 0 then
    return;
  end if;
  select name into v_title from public.trips where id = p_trip;
  if v_title is null then
    return;
  end if;
  insert into public.notifications (user_id, trip_id, title, body, tag, url)
  select distinct u, p_trip, v_title, left(p_body, 240), left(p_tag, 120), '#/viaje/' || p_trip
  from unnest(p_users) as u
  where u is not null;
end;
$$;

-- Jugadores del viaje menos los que se indiquen
create or replace function public.notify_trip(p_trip uuid, p_except uuid[], p_body text, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_users(
    array(select user_id from public.trip_members
          where trip_id = p_trip and not (user_id = any (coalesce(p_except, '{}')))),
    p_trip, p_body, p_tag
  );
end;
$$;

revoke execute on function public.notif_name(uuid) from public, anon, authenticated;
revoke execute on function public.notify_users(uuid[], uuid, text, text) from public, anon, authenticated;
revoke execute on function public.notify_trip(uuid, uuid[], text, text) from public, anon, authenticated;

-- Cada aviso nuevo se manda en vivo al dueño (para la app abierta)
create or replace function public.broadcast_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rt_send('user:' || new.user_id, jsonb_build_object(
    't', 'notifications', 'op', 'INSERT',
    'row', jsonb_build_object('id', new.id, 'trip_id', new.trip_id, 'title', new.title,
                              'body', new.body, 'tag', new.tag, 'url', new.url)
  ));
  return null;
end;
$$;

drop trigger if exists broadcast_change on public.notifications;
create trigger broadcast_change
  after insert on public.notifications
  for each row execute function public.broadcast_notification();

-- ---------- Qué se avisa ----------

-- Eventos: algo para votar, algo que te hicieron, y cuando se valida lo tuyo
create or replace function public.notify_trip_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := public.notif_name(new.actor_id);
  who text := public.notif_name(new.user_id);
  what text := trim(coalesce(new.emoji, '') || ' ' || new.title);
  pts text := case when new.points > 0 then '+' || new.points else new.points::text end || ' pts';
begin
  if tg_op = 'INSERT' then
    -- A quien le hicieron algo
    if new.user_id <> new.actor_id then
      perform public.notify_users(array[new.user_id], new.trip_id,
        case new.kind
          when 'burn' then '🔥 ' || actor || ' te quemó: ' || what
          when 'infraction' then '🚨 ' || actor || ' te marcó una infracción: ' || what
          when 'quiebre' then '😵 ' || actor || ' dice que quebraste'
          when 'duel' then '⚔️ ¡Ganaste el duelo! ' || what
          when 'card' then '🃏 ' || actor || ' usó una carta con vos: ' || what
          else what || ' (' || pts || ')'
        end,
        'evento-' || new.id);
    end if;
    -- Los que tienen que votar
    if new.status = 'pending' then
      perform public.notify_trip(new.trip_id, array[new.actor_id, new.user_id],
        '🗳️ ' || case
          when new.kind = 'drink' then who || ' se tomó ' || what
          when new.kind = 'mission' then who || ' dice que cumplió la misión'
          when new.kind = 'burn' then actor || ' quemó a ' || who
          when new.kind = 'infraction' then actor || ' marcó a ' || who || ': ' || what
          when new.kind = 'quiebre' then actor || ' dice que ' || who || ' quebró'
          when new.kind = 'casino' then who || ' cargó lo que le quedó en el casino'
          when new.kind = 'duel' then 'Terminó un duelo: ' || what
          else who || ': ' || what
        end || '. ¡Votá!',
        'votar-' || new.trip_id);
    end if;
  elsif old.status = 'pending' and new.status <> 'pending' then
    perform public.notify_users(array[new.user_id], new.trip_id,
      case when new.status = 'approved'
        then '✅ Se validó: ' || what || ' (' || pts || ')'
        else '❌ No se validó: ' || what
      end,
      'evento-' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists notify_event on public.trip_events;
create trigger notify_event
  after insert or update of status on public.trip_events
  for each row execute function public.notify_trip_event();

-- Duelos
create or replace function public.notify_duel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text := case new.kind when 'fondo' then 'un fondo blanco' when 'shots' then 'un duelo de shots' else 'un duelo de baile' end;
begin
  if tg_op = 'INSERT' then
    if new.status = 'invited' then
      perform public.notify_users(array[new.opponent_id], new.trip_id,
        '⚔️ ' || public.notif_name(new.challenger_id) || ' te desafió a ' || label || '. ¿Aceptás?',
        'duelo-' || new.id);
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'live' then
      perform public.notify_users(array[new.challenger_id], new.trip_id,
        '⚔️ ' || public.notif_name(new.opponent_id) || ' aceptó ' || label || '. ¡Arranca!',
        'duelo-' || new.id);
    elsif new.status = 'declined' then
      perform public.notify_users(array[new.challenger_id], new.trip_id,
        '🐔 ' || public.notif_name(new.opponent_id) || ' no aceptó ' || label,
        'duelo-' || new.id);
    elsif new.status = 'voting' then
      perform public.notify_trip(new.trip_id, array[new.challenger_id, new.opponent_id],
        '💃 ¿Quién bailó mejor? ' || public.notif_name(new.challenger_id) || ' vs '
          || public.notif_name(new.opponent_id) || '. ¡Votá!',
        'duelo-' || new.id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists notify_duel on public.duels;
create trigger notify_duel
  after insert or update of status on public.duels
  for each row execute function public.notify_duel();

-- Hora boliche
create or replace function public.notify_boliche()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.boliche_at is not null and old.boliche_at is null then
    perform public.notify_trip(new.id, array[new.owner_id],
      '🪩 ¡Arrancó la Hora boliche! Misiones, prendas y duelos de boliche.', 'boliche-' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists notify_boliche on public.trips;
create trigger notify_boliche
  after update of boliche_at on public.trips
  for each row execute function public.notify_boliche();

-- Casino
create or replace function public.notify_casino()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_trip(new.trip_id, array[new.started_by],
      '🎰 ' || public.notif_name(new.started_by) || ' armó una salida al casino. ¡Sumate!',
      'casino-' || new.id);
  elsif new.status = 'reporting' and old.status = 'running' then
    perform public.notify_users(
      array(select user_id from public.casino_players
            where session_id = new.id and busted_at is null),
      new.trip_id,
      '🎰 Se terminó el tiempo del casino: si te quedó plata, subí la foto.',
      'casino-' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists notify_casino on public.casino_sessions;
create trigger notify_casino
  after insert or update of status on public.casino_sessions
  for each row execute function public.notify_casino();

-- Ruleta del chef / de la barra
create or replace function public.notify_chef()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text := case new.kind when 'comida' then 'quién cocina' else 'quién prepara el trago' end;
begin
  if tg_op = 'INSERT' then
    perform public.notify_trip(new.trip_id, array[new.started_by],
      '🎡 ' || public.notif_name(new.started_by) || ' armó la ruleta de ' || label || '. ¡Metete!',
      'chef-' || new.id);
  elsif new.status is distinct from old.status then
    if new.status = 'cooking' and new.chosen_user_id is not null then
      perform public.notify_users(array[new.chosen_user_id], new.trip_id,
        case new.kind when 'comida' then '🍳 ¡Te tocó cocinar!' else '🍹 ¡Te tocó preparar el trago!' end,
        'chef-' || new.id);
    elsif new.status = 'voting' then
      perform public.notify_trip(new.trip_id, array[new.chosen_user_id],
        '🍽️ ¿Estuvo bueno lo de ' || public.notif_name(new.chosen_user_id) || '? ¡Votá!',
        'chef-' || new.id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists notify_chef on public.chef_spins;
create trigger notify_chef
  after insert or update of status on public.chef_spins
  for each row execute function public.notify_chef();

-- "Esta misión es mala": votación para cambiarla
create or replace function public.notify_challenge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_trip(new.trip_id, array[new.started_by, new.target_user_id],
      '🗳️ ' || public.notif_name(new.started_by) || ' dice que la misión de '
        || public.notif_name(new.target_user_id) || ' es mala. ¡Votá!',
      'reto-' || new.id);
  elsif new.phase = 'vote_option' and old.phase is distinct from 'vote_option' then
    perform public.notify_trip(new.trip_id, array[new.target_user_id],
      '🗳️ Elegí la misión nueva de ' || public.notif_name(new.target_user_id),
      'reto-' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists notify_challenge on public.mission_challenges;
create trigger notify_challenge
  after insert or update of phase on public.mission_challenges
  for each row execute function public.notify_challenge();

-- Te sumaron a un viaje
create or replace function public.notify_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.trips where id = new.trip_id;
  if owner is not null and new.user_id <> owner then
    perform public.notify_users(array[new.user_id], new.trip_id,
      '🎒 ' || public.notif_name(owner) || ' te sumó al plan. ¡Entrá!',
      'sumado-' || new.trip_id);
  end if;
  return null;
end;
$$;

drop trigger if exists notify_member on public.trip_members;
create trigger notify_member
  after insert on public.trip_members
  for each row execute function public.notify_member();

revoke execute on function public.notify_trip_event(), public.notify_duel(), public.notify_boliche(),
  public.notify_casino(), public.notify_chef(), public.notify_challenge(), public.notify_member(),
  public.broadcast_notification()
  from public, anon, authenticated;
