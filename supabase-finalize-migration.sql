-- =====================================================
-- FINAL SECURITY + DERIVED DATA MIGRATION
-- Run AFTER supabase-security-migration.sql.
-- =====================================================

begin;

-- Prevent accidental retrieval of legacy credentials during the migration window.
-- RLS controls rows; these grants also restrict sensitive columns.
revoke all on table public.players from anon, authenticated;
grant select (name, role, created) on public.players to anon, authenticated;
grant update (auth_user_id) on public.players to authenticated;

-- Admin role is still enforced by RLS for the update above.
-- No browser role receives SELECT on password or auth_user_id.

create or replace function public.refresh_league_achievements()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.achievements;

  -- Aggregate all-time player stats directly from the authoritative matches table.
  with expanded as (
    select id, season_id, player1 player, goals1 gf, goals2 ga, timestamp from public.matches
    union all
    select id, season_id, player2 player, goals2 gf, goals1 ga, timestamp from public.matches
  ), agg as (
    select p.name player,
      count(e.player)::int played,
      count(*) filter (where e.gf > e.ga)::int wins,
      coalesce(sum(e.gf),0)::int goals_for,
      count(*) filter (where e.ga = 0 and e.player is not null)::int clean_sheets
    from public.players p
    left join expanded e on e.player = p.name
    group by p.name
  )
  insert into public.achievements (player, achievement_id)
  select player, achievement_id
  from agg
  cross join lateral (
    values
      ('first_win', wins >= 1),
      ('wins10', wins >= 10),
      ('goals50', goals_for >= 50),
      ('goals100', goals_for >= 100),
      ('played20', played >= 20),
      ('clean5', clean_sheets >= 5)
  ) a(achievement_id, unlocked)
  where unlocked;

  -- Five consecutive wins. A non-win increments a break group; wins within the
  -- same group form a streak.
  with expanded as (
    select id, player1 player, (goals1 > goals2) won, timestamp from public.matches
    union all
    select id, player2 player, (goals2 > goals1) won, timestamp from public.matches
  ), ordered as (
    select *,
      sum(case when won then 0 else 1 end)
        over (partition by player order by timestamp, id rows unbounded preceding) grp
    from expanded
  ), streaks as (
    select player, grp, count(*)::int wins
    from ordered
    where won
    group by player, grp
  ), best as (
    select player, max(wins)::int best_streak from streaks group by player
  )
  insert into public.achievements (player, achievement_id)
  select player, 'streak5' from best where best_streak >= 5
  on conflict do nothing;

  -- Season champion: at least one match played and rank #1 under league tiebreakers.
  with expanded as (
    select season_id, player1 player, goals1 gf, goals2 ga from public.matches where season_id is not null
    union all
    select season_id, player2 player, goals2 gf, goals1 ga from public.matches where season_id is not null
  ), agg as (
    select season_id, player,
      count(*)::int played,
      count(*) filter (where gf > ga)::int wins,
      count(*) filter (where gf = ga)::int draws,
      sum(gf)::int goals_for,
      sum(ga)::int goals_against
    from expanded
    group by season_id, player
  ), ranked as (
    select *,
      row_number() over (
        partition by season_id
        order by (wins*3+draws) desc,
                 (goals_for-goals_against) desc,
                 goals_for desc,
                 player asc
      ) rank
    from agg
    where played > 0
  )
  insert into public.achievements (player, achievement_id)
  select distinct player, 'champion' from ranked where rank = 1
  on conflict do nothing;
end;
$$;

revoke all on function public.refresh_league_achievements() from public, anon, authenticated;

create or replace function public.trg_refresh_league_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_league_achievements();
  return null;
end;
$$;

drop trigger if exists zz_matches_refresh_achievements on public.matches;
create trigger zz_matches_refresh_achievements
after insert or update or delete on public.matches
for each statement execute function public.trg_refresh_league_achievements();

drop trigger if exists zz_players_refresh_achievements on public.players;
create trigger zz_players_refresh_achievements
after insert or update of name or delete on public.players
for each statement execute function public.trg_refresh_league_achievements();

perform public.refresh_league_achievements();

commit;

-- After ALL players have linked Supabase Auth users and old passwords are rotated,
-- remove the legacy column permanently with:
--   alter table public.players drop column if exists password;
