-- =====================================================
-- SERVER-DERIVED STANDINGS + ACHIEVEMENTS
-- Run after supabase-security-migration.sql.
-- =====================================================

begin;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.refresh_league_standings()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.standings;

  insert into public.standings
    (season,player,played,wins,draws,losses,goals_for,goals_against,goal_diff,points,rank,updated_at)
  with expanded as (
    select player1 player,goals1 gf,goals2 ga from public.matches
    union all
    select player2 player,goals2 gf,goals1 ga from public.matches
  ), agg as (
    select p.name player,
      count(e.player)::int played,
      count(*) filter(where e.gf>e.ga)::int wins,
      count(*) filter(where e.gf=e.ga and e.player is not null)::int draws,
      count(*) filter(where e.gf<e.ga)::int losses,
      coalesce(sum(e.gf),0)::int goals_for,
      coalesce(sum(e.ga),0)::int goals_against
    from public.players p
    left join expanded e on e.player=p.name
    group by p.name
  ), ranked as (
    select *,
      (goals_for-goals_against)::int goal_diff,
      (wins*3+draws)::int points,
      row_number() over(
        order by (wins*3+draws) desc,
                 (goals_for-goals_against) desc,
                 goals_for desc,
                 player asc
      )::int rank
    from agg
  )
  select 'all',player,played,wins,draws,losses,goals_for,goals_against,goal_diff,points,rank,now()
  from ranked;

  insert into public.standings
    (season,player,played,wins,draws,losses,goals_for,goals_against,goal_diff,points,rank,updated_at)
  with season_players as (
    select s.id season_id,p.name player
    from public.seasons s cross join public.players p
  ), expanded as (
    select season_id,player1 player,goals1 gf,goals2 ga from public.matches
    union all
    select season_id,player2 player,goals2 gf,goals1 ga from public.matches
  ), agg as (
    select sp.season_id,sp.player,
      count(e.player)::int played,
      count(*) filter(where e.gf>e.ga)::int wins,
      count(*) filter(where e.gf=e.ga and e.player is not null)::int draws,
      count(*) filter(where e.gf<e.ga)::int losses,
      coalesce(sum(e.gf),0)::int goals_for,
      coalesce(sum(e.ga),0)::int goals_against
    from season_players sp
    left join expanded e on e.season_id=sp.season_id and e.player=sp.player
    group by sp.season_id,sp.player
  ), ranked as (
    select *,
      (goals_for-goals_against)::int goal_diff,
      (wins*3+draws)::int points,
      row_number() over(
        partition by season_id
        order by (wins*3+draws) desc,
                 (goals_for-goals_against) desc,
                 goals_for desc,
                 player asc
      )::int rank
    from agg
  )
  select season_id::text,player,played,wins,draws,losses,goals_for,goals_against,goal_diff,points,rank,now()
  from ranked;
end;
$$;

create or replace function private.refresh_league_achievements()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  delete from public.achievements;

  with expanded as (
    select id,season_id,player1 player,goals1 gf,goals2 ga,timestamp from public.matches
    union all
    select id,season_id,player2 player,goals2 gf,goals1 ga,timestamp from public.matches
  ), agg as (
    select p.name player,
      count(e.player)::int played,
      count(*) filter(where e.gf>e.ga)::int wins,
      coalesce(sum(e.gf),0)::int goals_for,
      count(*) filter(where e.ga=0 and e.player is not null)::int clean_sheets
    from public.players p
    left join expanded e on e.player=p.name
    group by p.name
  )
  insert into public.achievements(player,achievement_id)
  select player,achievement_id
  from agg
  cross join lateral(values
    ('first_win',wins>=1),
    ('wins10',wins>=10),
    ('goals50',goals_for>=50),
    ('goals100',goals_for>=100),
    ('played20',played>=20),
    ('clean5',clean_sheets>=5)
  ) a(achievement_id,unlocked)
  where unlocked;

  with expanded as (
    select id,player1 player,(goals1>goals2) won,timestamp from public.matches
    union all
    select id,player2 player,(goals2>goals1) won,timestamp from public.matches
  ), ordered as (
    select *,
      sum(case when won then 0 else 1 end)
        over(partition by player order by timestamp,id rows unbounded preceding) grp
    from expanded
  ), streaks as (
    select player,grp,count(*)::int wins
    from ordered
    where won
    group by player,grp
  ), best as (
    select player,max(wins)::int best_streak
    from streaks
    group by player
  )
  insert into public.achievements(player,achievement_id)
  select player,'streak5'
  from best
  where best_streak>=5
  on conflict do nothing;

  with expanded as (
    select season_id,player1 player,goals1 gf,goals2 ga
    from public.matches where season_id is not null
    union all
    select season_id,player2 player,goals2 gf,goals1 ga
    from public.matches where season_id is not null
  ), agg as (
    select season_id,player,
      count(*)::int played,
      count(*) filter(where gf>ga)::int wins,
      count(*) filter(where gf=ga)::int draws,
      sum(gf)::int goals_for,
      sum(ga)::int goals_against
    from expanded
    group by season_id,player
  ), ranked as (
    select *,
      row_number() over(
        partition by season_id
        order by (wins*3+draws) desc,
                 (goals_for-goals_against) desc,
                 goals_for desc,
                 player asc
      )::int rank
    from agg
    where played>0
  )
  insert into public.achievements(player,achievement_id)
  select distinct player,'champion'
  from ranked
  where rank=1
  on conflict do nothing;
end;
$$;

revoke all on function private.refresh_league_standings() from public,anon,authenticated;
revoke all on function private.refresh_league_achievements() from public,anon,authenticated;

create or replace function private.trg_refresh_league_derived()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.refresh_league_standings();
  perform private.refresh_league_achievements();
  return null;
end;
$$;
revoke all on function private.trg_refresh_league_derived() from public,anon,authenticated;

drop trigger if exists matches_refresh_derived on public.matches;
create trigger matches_refresh_derived
after insert or update or delete on public.matches
for each statement execute function private.trg_refresh_league_derived();

drop trigger if exists players_refresh_derived on public.players;
create trigger players_refresh_derived
after insert or update of name or delete on public.players
for each statement execute function private.trg_refresh_league_derived();

select private.refresh_league_standings();
select private.refresh_league_achievements();

commit;
