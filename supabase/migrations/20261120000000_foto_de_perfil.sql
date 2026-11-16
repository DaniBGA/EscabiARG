-- EscabiARG: foto de perfil
--
-- Cada uno puede ponerse una foto (sacada con la cámara o elegida de la galería).
-- La app la recorta cuadrada y la achica (unos 30 KB) antes de subirla.
-- Se guarda en el bucket "avatars": cada uno solo puede subir, cambiar o borrar
-- la suya. Se ve con un enlace público con un nombre imposible de adivinar
-- (como en la mayoría de las apps), así carga rápido en todas las listas.

alter table public.profiles
  add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Subir mi foto de perfil" on storage.objects;
create policy "Subir mi foto de perfil" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Cambiar mi foto de perfil" on storage.objects;
create policy "Cambiar mi foto de perfil" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Borrar mi foto de perfil" on storage.objects;
create policy "Borrar mi foto de perfil" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Ver las propias (para poder listarlas y borrar la anterior)
drop policy if exists "Ver mis fotos de perfil" on storage.objects;
create policy "Ver mis fotos de perfil" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Guardar (o quitar) la foto: solo una de tu propia carpeta
create or replace function public.set_avatar(p_url text)
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
  if p_url is not null and (
    char_length(p_url) > 500
    or position('/storage/v1/object/public/avatars/' || me::text || '/' in p_url) = 0
  ) then
    raise exception 'AVATAR_INVALID';
  end if;
  update public.profiles set avatar_url = p_url where id = me;
end;
$$;

revoke execute on function public.set_avatar(text) from public, anon, authenticated;
grant execute on function public.set_avatar(text) to authenticated;

-- Al cambiar la foto se avisa en vivo a sus viajes y amigos
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
  if new.display_name is not distinct from old.display_name
     and new.avatar_url is not distinct from old.avatar_url then
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

-- La lectura del viaje trae la foto de cada jugador
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
                              else jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url) end
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
