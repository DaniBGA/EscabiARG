-- ============================================================
-- EscabiARG — EARLY ACCESS: cupo limitado de jugadores
--
-- ⚠️ Correr SOLO en el proyecto de Supabase del early access (después de
-- setup_completo.sql). NO en el de producción.
--
--  · Cuenta cuántas cuentas hay (cada persona que entró y sigue activa).
--  · Cuando se llega al cupo (100), la base rechaza cualquier cuenta nueva,
--    entre por donde entre: compartir el link no sirve para colarse.
--  · Si un invitado cierra sesión, su cuenta se borra y libera un lugar
--    (un invitado no puede volver a entrar a su cuenta igual).
--
-- Para cambiar el cupo (ej: a 150):
--   update public.early_access_settings set max_players = 150;
-- ============================================================

create table if not exists public.early_access_settings (
  id boolean primary key default true check (id),
  max_players int not null default 100 check (max_players between 1 and 100000)
);

insert into public.early_access_settings (id) values (true) on conflict (id) do nothing;

alter table public.early_access_settings enable row level security;
revoke all on public.early_access_settings from anon, authenticated;

-- Contador para la pantalla de entrada (lo puede ver cualquiera, sin cuenta)
create or replace function public.early_access_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registered', (select count(*) from auth.users),
    'max', (select max_players from public.early_access_settings where id)
  );
$$;

revoke execute on function public.early_access_status() from public;
grant execute on function public.early_access_status() to anon, authenticated;

-- El guardia: con el cupo lleno no se crea ninguna cuenta más
create or replace function public.early_access_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
begin
  -- De a uno por vez, así dos que entran juntos no pasan el cupo
  perform pg_advisory_xact_lock(hashtext('escabiarg:early-access'));
  select max_players into v_max from public.early_access_settings where id;
  if (select count(*) from auth.users) >= coalesce(v_max, 100) then
    raise exception 'EARLY_ACCESS_FULL';
  end if;
  return new;
end;
$$;

revoke execute on function public.early_access_guard() from public, anon, authenticated;

drop trigger if exists early_access_guard on auth.users;
create trigger early_access_guard
  before insert on auth.users
  for each row execute function public.early_access_guard();

-- Un invitado que cierra sesión deja su lugar libre
create or replace function public.leave_early_access()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid() and is_anonymous;
end;
$$;

revoke execute on function public.leave_early_access() from public, anon;
grant execute on function public.leave_early_access() to authenticated;

-- Cómo quedó
select public.early_access_status() as estado;
