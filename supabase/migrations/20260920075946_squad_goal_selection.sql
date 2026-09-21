-- Add saved football-player squads without rewriting historical competition data.
-- Apply after the consistency and safeupdate migrations.
begin;
create table if not exists public.squad_players (
  id uuid primary key default gen_random_uuid(),
  owner text not null references public.players(name) on update cascade on delete cascade,
  name text not null check (char_length(name) between 1 and 100 and name=btrim(name)),
  position text not null default 'FW' check (position in ('GK','DF','MF','FW')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists squad_players_owner_name_key on public.squad_players(owner,lower(name));
alter table public.squad_players enable row level security;
revoke all on public.squad_players from public,anon,authenticated;
grant select on public.squad_players to authenticated;
grant insert(id,owner,name,position,active) on public.squad_players to authenticated;
-- Ownership and identity cannot be reassigned, even by table update requests.
grant update(name,position,active) on public.squad_players to authenticated;
drop policy if exists squad_read on public.squad_players;
drop policy if exists squad_insert on public.squad_players;
drop policy if exists squad_update on public.squad_players;
create policy squad_read on public.squad_players for select to authenticated using (true);
create policy squad_insert on public.squad_players for insert to authenticated
  with check (owner=(select private.current_player_name()) or (select private.is_league_admin()));
create policy squad_update on public.squad_players for update to authenticated
  using (owner=(select private.current_player_name()) or (select private.is_league_admin()))
  with check (owner=(select private.current_player_name()) or (select private.is_league_admin()));
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='squad_players') then
    alter publication supabase_realtime add table public.squad_players;
  end if;
end $$;

create or replace function public.save_league_match(match_data jsonb, goal_events jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare match_key uuid := (match_data->>'id')::uuid;
  p1 text := match_data->>'player1'; p2 text := match_data->>'player2';
  g1 integer := (match_data->>'goals1')::integer; g2 integer := (match_data->>'goals2')::integer;
begin
  if not (select private.is_league_admin()) then raise insufficient_privilege; end if;
  if match_key is null or jsonb_typeof(goal_events) is distinct from 'array'
    or p1 is null or p2 is null or p1=p2 or g1 is null or g2 is null or g1 not between 0 and 99 or g2 not between 0 and 99
  then raise exception 'EFL_INVALID_MATCH'; end if;
  -- Coordinate edits with existing matches and squad changes.
  perform 1 from public.matches where id=match_key for update;
  perform 1 from public.squad_players where owner in (p1,p2) for share;
  if jsonb_array_length(goal_events)=0 and g1+g2>0 and not exists(
    select 1 from public.matches m where m.id=match_key and m.player1=p1 and m.player2=p2
      and m.goals1=g1 and m.goals2=g2 and not exists(select 1 from public.match_goal_events old where old.match_id=m.id)
  ) then raise exception 'EFL_GOAL_COUNT'; end if;
  if jsonb_array_length(goal_events) > 0 then
    if exists(select 1 from jsonb_array_elements(goal_events) e where
      coalesce(e->>'owner','') not in (p1,p2) or length(trim(coalesce(e->>'scorer',''))) = 0)
      or (select count(*) from jsonb_array_elements(goal_events) e where e->>'owner'=p1) <> g1
      or (select count(*) from jsonb_array_elements(goal_events) e where e->>'owner'=p2) <> g2
    then raise exception 'EFL_GOAL_COUNT'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(goal_events) e
    where trim(coalesce(e->>'assist',''))<>'' and lower(trim(e->>'scorer'))=lower(trim(e->>'assist'))
  ) then raise exception 'EFL_SELF_ASSIST'; end if;
  -- Names are snapshots in historical matches. A retired/renamed footballer
  -- may only be retained on a match where that field was already recorded.
  if exists(select 1 from jsonb_array_elements(goal_events) e
    where not exists(select 1 from public.squad_players s where s.owner=e->>'owner' and s.active and s.name=trim(e->>'scorer'))
      and not exists(select 1 from public.match_goal_events old where old.match_id=match_key and old.owner=e->>'owner' and old.scorer=trim(e->>'scorer'))
  ) then raise exception 'EFL_SCORER_NOT_IN_SQUAD'; end if;
  if exists(select 1 from jsonb_array_elements(goal_events) e
    where trim(coalesce(e->>'assist',''))<>''
      and not exists(select 1 from public.squad_players s where s.owner=e->>'owner' and s.active and s.name=trim(e->>'assist'))
      and not exists(select 1 from public.match_goal_events old where old.match_id=match_key and old.owner=e->>'owner' and old.assist=trim(e->>'assist'))
  ) then raise exception 'EFL_ASSIST_NOT_IN_SQUAD'; end if;
  insert into public.matches(id,player1,player2,goals1,goals2,date,season_id,timestamp)
  values(match_key,p1,p2,g1,g2,(match_data->>'date')::date,(match_data->>'season_id')::uuid,
    coalesce((match_data->>'timestamp')::bigint,(extract(epoch from now())*1000)::bigint))
  on conflict(id) do update set player1=excluded.player1,player2=excluded.player2,
    goals1=excluded.goals1,goals2=excluded.goals2,date=excluded.date,season_id=excluded.season_id;
  delete from public.match_goal_events where match_id=match_key;
  insert into public.match_goal_events(match_id,owner,scorer,assist,minute,sort_order)
    select match_key,e->>'owner',trim(e->>'scorer'),trim(coalesce(e->>'assist','')),
      coalesce((e->>'minute')::integer,0),(position-1)::integer
    from jsonb_array_elements(goal_events) with ordinality as event(e,position);
  delete from public.match_stats where match_id=match_key and player not in (p1,p2);
  return match_key;
end;
$$;
revoke all on function public.save_league_match(jsonb,jsonb) from public,anon;
grant execute on function public.save_league_match(jsonb,jsonb) to authenticated;

commit;
