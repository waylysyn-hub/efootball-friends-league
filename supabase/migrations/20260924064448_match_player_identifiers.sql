-- Add stable identities without removing canonical names or historical snapshots.
begin;
alter table public.players add column if not exists id uuid not null default gen_random_uuid() unique;
grant select(id) on public.players to anon,authenticated;

do $$
declare backfill_matches boolean := not exists(select 1 from information_schema.columns where table_schema='public' and table_name='matches' and column_name='player1_id');
  backfill_goals boolean := not exists(select 1 from information_schema.columns where table_schema='public' and table_name='match_goal_events' and column_name='scorer_id');
begin
  alter table public.matches add column if not exists player1_id uuid references public.players(id);
  alter table public.matches add column if not exists player2_id uuid references public.players(id);
  alter table public.match_goal_events add column if not exists owner_id uuid references public.players(id);
  alter table public.match_goal_events add column if not exists scorer_id uuid references public.squad_players(id);
  alter table public.match_goal_events add column if not exists assist_id uuid references public.squad_players(id);
  if backfill_matches then
    -- ALTER TABLE holds an exclusive lock for this transaction. Suspend only
    -- the derived-cache refresh during identity backfill: scores and dates do
    -- not change, and achievement/standings timestamps must remain untouched.
    -- Authorization policies and validation triggers remain enabled.
    alter table public.matches disable trigger matches_refresh_derived;
    update public.matches m set player1_id=p1.id,player2_id=p2.id
      from public.players p1,public.players p2 where p1.name=m.player1 and p2.name=m.player2;
    alter table public.matches enable trigger matches_refresh_derived;
  end if;
  if backfill_goals then
    update public.match_goal_events e set owner_id=p.id from public.players p where p.name=e.owner;
    update public.match_goal_events e set scorer_id=s.id from public.squad_players s
      where s.owner=e.owner and lower(s.name)=lower(trim(e.scorer));
    update public.match_goal_events e set assist_id=s.id from public.squad_players s
      where s.owner=e.owner and lower(s.name)=lower(trim(e.assist)) and e.assist<>'';
  end if;
end $$;
alter table public.matches alter column player1_id set not null;
alter table public.matches alter column player2_id set not null;
alter table public.match_goal_events alter column owner_id set not null;
create index if not exists matches_player1_id_idx on public.matches(player1_id);
create index if not exists matches_player2_id_idx on public.matches(player2_id);
create index if not exists match_goals_owner_id_idx on public.match_goal_events(owner_id);
create index if not exists match_goals_scorer_id_idx on public.match_goal_events(scorer_id);
create index if not exists match_goals_assist_id_idx on public.match_goal_events(assist_id);

-- Keep old clients/imports compatible while validating IDs on direct table writes too.
create or replace function private.sync_match_player_ids()
returns trigger language plpgsql security invoker set search_path='' as $$
declare first_player public.players; second_player public.players;
begin
  if tg_op='UPDATE' then
    if new.player1 is distinct from old.player1 and new.player1_id is not distinct from old.player1_id then new.player1_id:=null; end if;
    if new.player2 is distinct from old.player2 and new.player2_id is not distinct from old.player2_id then new.player2_id:=null; end if;
    if new.player1_id is distinct from old.player1_id and new.player1 is not distinct from old.player1 then new.player1:=null; end if;
    if new.player2_id is distinct from old.player2_id and new.player2 is not distinct from old.player2 then new.player2:=null; end if;
  end if;
  select * into first_player from public.players where case when new.player1_id is not null then id=new.player1_id else name=new.player1 end;
  select * into second_player from public.players where case when new.player2_id is not null then id=new.player2_id else name=new.player2 end;
  if first_player.id is null or second_player.id is null or first_player.id=second_player.id then raise exception 'EFL_DIFFERENT_PLAYERS'; end if;
  if (new.player1 is not null and new.player1<>first_player.name) or (new.player2 is not null and new.player2<>second_player.name) then raise exception 'EFL_INVALID_MATCH'; end if;
  new.player1:=first_player.name; new.player1_id:=first_player.id;
  new.player2:=second_player.name; new.player2_id:=second_player.id;
  return new;
end $$;
revoke all on function private.sync_match_player_ids() from public,anon,authenticated;
drop trigger if exists matches_player_ids on public.matches;
create trigger matches_player_ids before insert or update on public.matches for each row execute function private.sync_match_player_ids();

create or replace function private.sync_goal_player_ids()
returns trigger language plpgsql security invoker set search_path='' as $$
declare player_key uuid;
begin
  select id into player_key from public.players where name=new.owner;
  if player_key is null or (new.owner_id is not null and new.owner_id<>player_key) then raise exception 'EFL_INVALID_MATCH'; end if;
  new.owner_id:=player_key;
  if not exists(select 1 from public.matches where id=new.match_id and player_key in (player1_id,player2_id)) then raise exception 'EFL_GOAL_COUNT'; end if;
  if new.scorer_id is not null and not exists(select 1 from public.squad_players where id=new.scorer_id and owner=new.owner) then raise exception 'EFL_SCORER_NOT_IN_SQUAD'; end if;
  if new.assist='' then
    if new.assist_id is not null then raise exception 'EFL_ASSIST_NOT_IN_SQUAD'; end if;
  elsif new.assist_id is not null and not exists(select 1 from public.squad_players where id=new.assist_id and owner=new.owner) then raise exception 'EFL_ASSIST_NOT_IN_SQUAD'; end if;
  if new.assist<>'' and (case when new.scorer_id is not null and new.assist_id is not null then new.scorer_id=new.assist_id
    else lower(trim(new.scorer))=lower(trim(new.assist)) end) then raise exception 'EFL_SELF_ASSIST'; end if;
  return new;
end $$;
revoke all on function private.sync_goal_player_ids() from public,anon,authenticated;
drop trigger if exists match_goals_player_ids on public.match_goal_events;
create trigger match_goals_player_ids before insert or update on public.match_goal_events for each row execute function private.sync_goal_player_ids();

create or replace function public.save_league_match(match_data jsonb, goal_events jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare match_key uuid := (match_data->>'id')::uuid;
  p1 public.players; p2 public.players; team public.players;
  g1 integer := (match_data->>'goals1')::integer; g2 integer := (match_data->>'goals2')::integer;
  event jsonb; normalized jsonb := '[]'; field text; member public.squad_players; old_event public.match_goal_events;
  member_id uuid; member_name text; source_id uuid; scorer_key uuid; scorer_name text;
begin
  if not (select private.is_league_admin()) then raise insufficient_privilege; end if;
  select * into p1 from public.players where case when match_data ? 'player1_id' then id=(match_data->>'player1_id')::uuid else name=match_data->>'player1' end;
  select * into p2 from public.players where case when match_data ? 'player2_id' then id=(match_data->>'player2_id')::uuid else name=match_data->>'player2' end;
  if p1.id is not null and p1.id=p2.id then raise exception 'EFL_DIFFERENT_PLAYERS'; end if;
  if match_key is null or p1.id is null or p2.id is null or jsonb_typeof(goal_events) is distinct from 'array'
    or g1 is null or g2 is null or g1 not between 0 and 99 or g2 not between 0 and 99
    or (match_data ? 'player1' and match_data->>'player1'<>p1.name) or (match_data ? 'player2' and match_data->>'player2'<>p2.name)
  then raise exception 'EFL_INVALID_MATCH'; end if;
  perform 1 from public.matches where id=match_key for update;
  perform 1 from public.squad_players where owner in (p1.name,p2.name) for share;
  if jsonb_array_length(goal_events)>g1+g2 then raise exception 'EFL_GOAL_COUNT'; end if;
  for event in select value from jsonb_array_elements(goal_events) loop
    select * into team from public.players where case when event ? 'owner_id' then id=(event->>'owner_id')::uuid else name=event->>'owner' end;
    if team.id is null or team.id not in (p1.id,p2.id) or (event ? 'owner' and event->>'owner'<>team.name) then raise exception 'EFL_GOAL_COUNT'; end if;
    scorer_key:=null; scorer_name:=null;
    foreach field in array array['scorer','assist'] loop
      member_id:=null; member_name:=null; member:=null; old_event:=null;
      source_id:=coalesce(nullif(event->>('legacy_'||field||'_event_id'),'')::uuid,nullif(event->>'source_event_id','')::uuid);
      if source_id is not null then
        select * into old_event from public.match_goal_events where id=source_id and match_id=match_key and owner_id=team.id;
      end if;
      if nullif(event->>(field||'_id'),'') is not null then
        select * into member from public.squad_players where id=(event->>(field||'_id'))::uuid and owner=team.name;
        if member.id is not null and (member.active or exists(
          select 1 from public.match_goal_events e where e.match_id=match_key and e.owner_id=team.id
            and case when field='scorer' then e.scorer_id=member.id else e.assist_id=member.id end)) then
          member_id:=member.id;
          member_name:=case when field='scorer' and old_event.scorer_id=member.id then old_event.scorer
            when field='assist' and old_event.assist_id=member.id then old_event.assist else member.name end;
        end if;
      elsif nullif(event->>('legacy_'||field||'_event_id'),'') is not null then
        member_id:=case when field='scorer' then old_event.scorer_id else old_event.assist_id end;
        member_name:=case when field='scorer' then old_event.scorer else old_event.assist end;
      elsif nullif(trim(event->>field),'') is not null then
        -- Cached clients retain an existing snapshot before resolving a new
        -- active name, so reusing a renamed player's old label cannot steal goals.
        select * into old_event from public.match_goal_events e where e.match_id=match_key and e.owner_id=team.id
          and case when field='scorer' then e.scorer=trim(event->>field) else e.assist=trim(event->>field) end order by e.sort_order,e.id limit 1;
        if old_event.id is not null then
          member_id:=case when field='scorer' then old_event.scorer_id else old_event.assist_id end;
          member_name:=case when field='scorer' then old_event.scorer else old_event.assist end;
        else
          select * into member from public.squad_players where owner=team.name and name=trim(event->>field) and active;
          if member.id is not null then member_id:=member.id; member_name:=member.name; end if;
        end if;
      elsif field='assist' then member_name:='';
      end if;
      if member_name is null or (field='scorer' and member_name='') then
        if field='scorer' then raise exception 'EFL_SCORER_NOT_IN_SQUAD'; else raise exception 'EFL_ASSIST_NOT_IN_SQUAD'; end if;
      end if;
      if field='scorer' then scorer_key:=member_id; scorer_name:=member_name;
      elsif member_name<>'' and (case when member_id is not null and scorer_key is not null then member_id=scorer_key
        else lower(member_name)=lower(scorer_name) end) then raise exception 'EFL_SELF_ASSIST'; end if;
      event:=event || jsonb_build_object(field,member_name,field||'_id',member_id);
    end loop;
    normalized:=normalized || jsonb_build_array(event || jsonb_build_object('owner',team.name,'owner_id',team.id,'id',coalesce(
      (select id from public.match_goal_events where id=nullif(event->>'source_event_id','')::uuid and match_id=match_key),gen_random_uuid())));
  end loop;
  if jsonb_array_length(normalized)>0 and (
    (select count(*) from jsonb_array_elements(normalized) e where e->>'owner_id'=p1.id::text)<>g1 or
    (select count(*) from jsonb_array_elements(normalized) e where e->>'owner_id'=p2.id::text)<>g2
  ) then raise exception 'EFL_GOAL_COUNT'; end if;
  insert into public.matches(id,player1,player2,player1_id,player2_id,goals1,goals2,date,season_id,timestamp)
    values(match_key,p1.name,p2.name,p1.id,p2.id,g1,g2,(match_data->>'date')::date,(match_data->>'season_id')::uuid,
      coalesce((match_data->>'timestamp')::bigint,(extract(epoch from now())*1000)::bigint))
    on conflict(id) do update set player1=excluded.player1,player2=excluded.player2,player1_id=excluded.player1_id,player2_id=excluded.player2_id,
      goals1=excluded.goals1,goals2=excluded.goals2,date=excluded.date,season_id=excluded.season_id;
  delete from public.match_goal_events where match_id=match_key;
  insert into public.match_goal_events(id,match_id,owner,owner_id,scorer,scorer_id,assist,assist_id,minute,sort_order)
    select (e->>'id')::uuid,match_key,e->>'owner',(e->>'owner_id')::uuid,e->>'scorer',(e->>'scorer_id')::uuid,e->>'assist',(e->>'assist_id')::uuid,
      coalesce((e->>'minute')::integer,0),(position-1)::integer
    from jsonb_array_elements(normalized) with ordinality as events(e,position);
  delete from public.match_stats where match_id=match_key and player not in (p1.name,p2.name);
  return match_key;
end $$;
revoke all on function public.save_league_match(jsonb,jsonb) from public,anon;
grant execute on function public.save_league_match(jsonb,jsonb) to authenticated;
-- Preserve new identities in competition backups; old backups remain accepted.
create or replace function public.restore_league_competition(backup jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select private.is_league_admin()) then raise insufficient_privilege; end if;
  if jsonb_typeof(backup->'seasons') is distinct from 'array'
    or jsonb_typeof(backup->'matches') is distinct from 'array'
    or jsonb_typeof(backup->'goalEvents') is distinct from 'array'
    or jsonb_typeof(backup->'matchStats') is distinct from 'array'
  then raise exception 'Invalid competition backup'; end if;
  -- This admin-only restore intentionally replaces the competition. Explicit
  -- primary-key predicates keep the operation compatible with pg-safeupdate.
  delete from public.matches where id is not null;
  delete from public.seasons where id is not null;
  insert into public.seasons(id,name,active,created)
    select (s->>'id')::uuid,s->>'name',coalesce((s->>'active')::boolean,false),
      coalesce((s->>'created')::bigint,0) from jsonb_array_elements(backup->'seasons') s;
  if (select count(*) from public.seasons where active) > 1 then raise exception 'Only one active season is allowed'; end if;
  insert into public.matches(id,player1,player2,goals1,goals2,date,season_id,timestamp,player1_id,player2_id)
    select (m->>'id')::uuid,m->>'player1',m->>'player2',(m->>'goals1')::integer,(m->>'goals2')::integer,
      (m->>'date')::date,(m->>'season')::uuid,coalesce((m->>'timestamp')::bigint,0),(m->>'player1Id')::uuid,(m->>'player2Id')::uuid
    from jsonb_array_elements(backup->'matches') m;
  insert into public.match_goal_events(match_id,owner,scorer,assist,minute,sort_order,owner_id,scorer_id,assist_id)
    select (e->>'matchId')::uuid,e->>'owner',e->>'scorer',coalesce(e->>'assist',''),
      coalesce((e->>'minute')::integer,0),coalesce((e->>'sortOrder')::integer,0),(e->>'ownerId')::uuid,(e->>'scorerId')::uuid,(e->>'assistId')::uuid
    from jsonb_array_elements(backup->'goalEvents') e;
  insert into public.match_stats(match_id,player,character_name,goals,assists)
    select (s->>'matchId')::uuid,s->>'player',coalesce(s->>'characterName',''),
      coalesce((s->>'goals')::integer,0),coalesce((s->>'assists')::integer,0)
    from jsonb_array_elements(backup->'matchStats') s;
end;
$$;
revoke all on function public.restore_league_competition(jsonb) from public,anon;
grant execute on function public.restore_league_competition(jsonb) to authenticated;
commit;
