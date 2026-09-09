-- =====================================================
-- AUTH PROFILE RPCS
-- Run after supabase-security-migration.sql.
-- Keeps auth_user_id unreadable to browser clients.
-- =====================================================

begin;

create or replace function public.current_player_profile()
returns table(name text, role text, created bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.role, p.created
  from public.players p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

grant execute on function public.current_player_profile() to authenticated;

create or replace function public.link_player_auth_user(target_name text, target_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_admin() then
    raise exception 'Admin permission required';
  end if;

  if target_name is null or target_auth_user_id is null then
    raise exception 'Missing player or auth user id';
  end if;

  update public.players
  set auth_user_id = target_auth_user_id
  where name = target_name
    and auth_user_id is null;

  if not found then
    raise exception 'Player not found or already linked';
  end if;
end;
$$;

revoke all on function public.link_player_auth_user(text, uuid) from public, anon;
grant execute on function public.link_player_auth_user(text, uuid) to authenticated;

commit;
