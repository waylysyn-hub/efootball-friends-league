-- Additive transaction helpers. Run AFTER security and derived-data migrations.
-- No existing rows are removed by installing this file. Callers remain subject to RLS.
begin;

create or replace function public.save_league_match(match_data jsonb, goal_events jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare match_key uuid := (match_data->>'id')::uuid;
  p1 text := match_data->>'player1'; p2 text := match_data->>'player2';
  g1 integer := (match_data->>'goals1')::integer; g2 integer := (match_data->>'goals2')::integer;
begin
  if not (select private.is_league_admin()) then raise insufficient_privilege; end if;
  if match_key is null or jsonb_typeof(goal_events) <> 'array' then raise exception 'Invalid match payload'; end if;
  if jsonb_array_length(goal_events) > 0 then
    if exists(select 1 from jsonb_array_elements(goal_events) e where
      coalesce(e->>'owner','') not in (p1,p2) or length(trim(coalesce(e->>'scorer',''))) = 0)
      or (select count(*) from jsonb_array_elements(goal_events) e where e->>'owner'=p1) <> g1
      or (select count(*) from jsonb_array_elements(goal_events) e where e->>'owner'=p2) <> g2
    then raise exception 'Goal events must match the result'; end if;
  end if;
  insert into public.matches(id,player1,player2,goals1,goals2,date,season_id,timestamp)
  values(match_key,p1,p2,g1,g2,(match_data->>'date')::date,(match_data->>'season_id')::uuid,
    coalesce((match_data->>'timestamp')::bigint,(extract(epoch from now())*1000)::bigint))
  on conflict(id) do update set player1=excluded.player1,player2=excluded.player2,
    goals1=excluded.goals1,goals2=excluded.goals2,date=excluded.date,season_id=excluded.season_id;
  delete from public.match_goal_events where match_id=match_key;
  insert into public.match_goal_events(match_id,owner,scorer,assist,minute,sort_order)
    select match_key,e->>'owner',trim(e->>'scorer'),coalesce(e->>'assist',''),
      coalesce((e->>'minute')::integer,0),(position-1)::integer
    from jsonb_array_elements(goal_events) with ordinality as event(e,position);
  delete from public.match_stats where match_id=match_key and player not in (p1,p2);
  return match_key;
end;
$$;
revoke all on function public.save_league_match(jsonb,jsonb) from public,anon;
grant execute on function public.save_league_match(jsonb,jsonb) to authenticated;

create or replace function public.set_league_active_season(target uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select private.is_league_admin()) then raise insufficient_privilege; end if;
  lock table public.seasons in share row exclusive mode;
  if not exists(select 1 from public.seasons where id=target) then raise exception 'Season not found'; end if;
  update public.seasons set active=(id=target) where active or id=target;
end;
$$;
revoke all on function public.set_league_active_season(uuid) from public,anon;
grant execute on function public.set_league_active_season(uuid) to authenticated;

-- A competition restore preserves identities, Q&A and chat. The transaction rolls
-- back the deletion too if any reference, check constraint or insert fails.
create or replace function public.restore_league_competition(backup jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select private.is_league_admin()) then raise insufficient_privilege; end if;
  if jsonb_typeof(backup->'seasons') is distinct from 'array'
    or jsonb_typeof(backup->'matches') is distinct from 'array'
    or jsonb_typeof(backup->'goalEvents') is distinct from 'array'
    or jsonb_typeof(backup->'matchStats') is distinct from 'array'
  then raise exception 'Invalid competition backup'; end if;
  delete from public.matches;
  delete from public.seasons;
  insert into public.seasons(id,name,active,created)
    select (s->>'id')::uuid,s->>'name',coalesce((s->>'active')::boolean,false),
      coalesce((s->>'created')::bigint,0) from jsonb_array_elements(backup->'seasons') s;
  if (select count(*) from public.seasons where active) > 1 then raise exception 'Only one active season is allowed'; end if;
  insert into public.matches(id,player1,player2,goals1,goals2,date,season_id,timestamp)
    select (m->>'id')::uuid,m->>'player1',m->>'player2',(m->>'goals1')::integer,(m->>'goals2')::integer,
      (m->>'date')::date,(m->>'season')::uuid,coalesce((m->>'timestamp')::bigint,0)
    from jsonb_array_elements(backup->'matches') m;
  insert into public.match_goal_events(match_id,owner,scorer,assist,minute,sort_order)
    select (e->>'matchId')::uuid,e->>'owner',e->>'scorer',coalesce(e->>'assist',''),
      coalesce((e->>'minute')::integer,0),coalesce((e->>'sortOrder')::integer,0)
    from jsonb_array_elements(backup->'goalEvents') e;
  insert into public.match_stats(match_id,player,character_name,goals,assists)
    select (s->>'matchId')::uuid,s->>'player',coalesce(s->>'characterName',''),
      coalesce((s->>'goals')::integer,0),coalesce((s->>'assists')::integer,0)
    from jsonb_array_elements(backup->'matchStats') s;
end;
$$;
revoke all on function public.restore_league_competition(jsonb) from public,anon;
grant execute on function public.restore_league_competition(jsonb) to authenticated;

create or replace function public.respond_chat_invitation(invitation_id uuid, accept boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare invitation public.chat_invitations;
begin
  select * into invitation from public.chat_invitations
    where id=invitation_id and invited_player=(select private.current_player_name()) for update;
  if not found then raise exception 'Invitation not found'; end if;
  if invitation.status='pending' then
    update public.chat_invitations set status=case when accept then 'accepted' else 'rejected' end where id=invitation_id;
  elsif invitation.status <> (case when accept then 'accepted' else 'rejected' end) then
    raise exception 'Invitation already answered';
  end if;
  if accept then
    insert into public.chat_group_members(group_id,player)
    values(invitation.group_id,invitation.invited_player) on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.respond_chat_invitation(uuid,boolean) from public,anon;
grant execute on function public.respond_chat_invitation(uuid,boolean) to authenticated;

-- Preserve database-derived standings when an empty season is created/deleted.
drop trigger if exists seasons_refresh_derived on public.seasons;
create trigger seasons_refresh_derived after insert or update or delete on public.seasons
for each statement execute function private.trg_refresh_league_derived();

-- Enforce Q&A closure and answer linkage in Postgres too.
create or replace function private.guard_league_answer()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.author <> old.author or new.question_id <> old.question_id) then
    raise exception 'Answer ownership cannot change';
  end if;
  if not exists(select 1 from public.questions where id=new.question_id and not closed) then
    raise exception 'This question is closed or unavailable';
  end if;
  return new;
end;
$$;
create or replace function private.guard_league_question()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.author <> old.author then raise exception 'Question ownership cannot change'; end if;
  if new.correct_answer_id is not null and not exists(
    select 1 from public.answers where id=new.correct_answer_id and question_id=new.id
  ) then raise exception 'Correct answer belongs to another question'; end if;
  return new;
end;
$$;
revoke all on function private.guard_league_answer(),private.guard_league_question() from public,anon,authenticated;
drop trigger if exists answers_guard on public.answers;
create trigger answers_guard before insert or update on public.answers for each row execute function private.guard_league_answer();
drop trigger if exists questions_guard on public.questions;
create trigger questions_guard before insert or update on public.questions for each row execute function private.guard_league_question();
create or replace function public.create_league_chat_group(group_id uuid, group_name text, group_description text, group_emoji text, palette integer)
returns public.chat_groups language plpgsql security invoker set search_path = '' as $$
declare player_name text := (select private.current_player_name()); new_group public.chat_groups;
begin
  if player_name is null then raise insufficient_privilege; end if;
  insert into public.chat_groups(id,name,description,emoji,palette_index,created_by)
    values(group_id,trim(group_name),trim(group_description),group_emoji,palette,player_name)
    on conflict(id) do nothing;
  select * into new_group from public.chat_groups where id=group_id and created_by=player_name;
  if not found then raise insufficient_privilege; end if;
  insert into public.chat_group_members(group_id,player) values(new_group.id,player_name) on conflict do nothing;
  return new_group;
end;
$$;
revoke all on function public.create_league_chat_group(uuid,text,text,text,integer) from public,anon;
grant execute on function public.create_league_chat_group(uuid,text,text,text,integer) to authenticated;
commit;
