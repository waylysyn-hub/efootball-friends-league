-- eFootball-style detailed positions, exactly-11 starter cap, and safe squad deletion.
begin;

-- Replace the legacy broad-position constraint before converting rows.
alter table public.squad_players drop constraint if exists squad_players_position_check;

-- Preserve inactive unknown legacy rows without inventing a football position.
-- Active legacy broad positions get the neutral eFootball equivalent in their line.
update public.squad_players set position='CB'  where position='DF';
update public.squad_players set position='CMF' where position='MF';
update public.squad_players set position='CMF' where active and position='UNK';
update public.squad_players set position='CF'  where position='FW';

-- Starter used to be the default for every row. For legacy squads above eleven,
-- preserve all players and demote only the overflow to substitutes deterministically.
with ranked as (
  select id,
         row_number() over (partition by owner order by created_at nulls last, id) as rn
  from public.squad_players
  where active and lineup_role='starter'
)
update public.squad_players s
set lineup_role='substitute'
from ranked r
where s.id=r.id and r.rn>11;

alter table public.squad_players
  add constraint squad_players_position_check
  check (
    position in ('GK','RB','LB','CB','RMF','LMF','CMF','AMF','DMF','LWF','RWF','SS','CF')
    or (not active and position='UNK')
  );

alter table public.squad_players alter column position set default 'CF';

create or replace function private.enforce_squad_starter_limit()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare starter_count integer;
begin
  -- Serialize starter-count changes per squad owner so concurrent requests cannot create a 12th starter.
  perform pg_catalog.pg_advisory_xact_lock(146454, pg_catalog.hashtext(new.owner));

  if new.active and new.lineup_role='starter' then
    select count(*) into starter_count
    from public.squad_players s
    where s.owner=new.owner
      and s.active
      and s.lineup_role='starter'
      and s.id<>new.id;

    if starter_count >= 11 then
      raise exception 'EFL_STARTER_LIMIT' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_squad_starter_limit() from public,anon,authenticated;
drop trigger if exists squad_player_starter_limit on public.squad_players;
create trigger squad_player_starter_limit
before insert or update of owner,active,lineup_role on public.squad_players
for each row execute function private.enforce_squad_starter_limit();

create or replace function public.delete_squad_player(target uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare member public.squad_players%rowtype;
begin
  select * into member
  from public.squad_players
  where id=target
  for update;

  if not found then
    raise exception 'EFL_SQUAD_PLAYER_NOT_FOUND';
  end if;

  if not (
    member.owner=(select private.current_player_name())
    or (select private.is_league_admin())
  ) then
    raise insufficient_privilege;
  end if;

  if exists (
    select 1
    from public.match_goal_events e
    where e.scorer_id=target or e.assist_id=target
  ) then
    raise exception 'EFL_SQUAD_PLAYER_HISTORY';
  end if;

  delete from public.squad_players where id=target;
  return member.photo_path;
end;
$$;

revoke all on function public.delete_squad_player(uuid) from public,anon;
grant execute on function public.delete_squad_player(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
