-- EscabiARG: aceptación de términos y condiciones
--
-- Al registrarse o entrar como invitado, la app muestra los términos y pide
-- confirmar que la persona es mayor de 18 y que los acepta. Se guarda qué
-- versión aceptó y cuándo; si los términos cambian, se piden de nuevo.

alter table public.profiles
  add column if not exists terms_version int not null default 0,
  add column if not exists terms_accepted_at timestamptz;

create or replace function public.accept_terms(p_version int)
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
  if p_version is null or p_version < 1 then
    raise exception 'INVALID_TERMS_VERSION';
  end if;
  update public.profiles
  set terms_version = greatest(terms_version, p_version), terms_accepted_at = now()
  where id = me;
end;
$$;

revoke execute on function public.accept_terms(int) from public, anon, authenticated;
grant execute on function public.accept_terms(int) to authenticated;
