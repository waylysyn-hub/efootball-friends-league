-- =====================================================
-- eFootball Friends League — unified security migration v2
-- Safe for the existing legacy schema and the new password-free schema.
-- Prerequisite: run supabase-groups-chat-migration.sql first if chat is used.
-- =====================================================

begin;

-- ---------- PLAYER PROFILE UPGRADE ----------
alter table public.players add column if not exists auth_user_id uuid unique;
alter table public.players add column if not exists role text not null default 'player';
alter table public.players drop constraint if exists players_role_check;
alter table public.players add constraint players_role_check check (role in ('admin', 'player'));

-- Legacy installations may still have a password column. Keep it only long enough
-- to migrate accounts, but make it nullable and remove browser access to it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'password'
  ) then
    alter table public.players alter column password drop not null;
  end if;
end $$;

update public.players set role = case when name = 'Wael' then 'admin' else 'player' end;

-- ---------- IDENTITY HELPERS ----------
create or replace function public.current_player_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.name from public.players p where p.auth_user_id = auth.uid() limit 1
$$;

create or replace function public.current_player_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.players p where p.auth_user_id = auth.uid() limit 1
$$;

create or replace function public.is_league_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_player_role() = 'admin', false)
$$;

grant execute on function public.current_player_name() to authenticated;
grant execute on function public.current_player_role() to authenticated;
grant execute on function public.is_league_admin() to authenticated;

-- ---------- REMOVE ALL LEGACY POLICIES ----------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'players','seasons','matches','standings','achievements','questions','answers',
        'match_stats','match_goal_events','chat_groups','chat_group_members','chat_messages','chat_invitations'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------- ENABLE RLS ----------
alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.matches enable row level security;
alter table public.standings enable row level security;
alter table public.achievements enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.match_stats enable row level security;
alter table public.match_goal_events enable row level security;

do $$
begin
  if to_regclass('public.chat_groups') is not null then
    alter table public.chat_groups enable row level security;
    alter table public.chat_group_members enable row level security;
    alter table public.chat_messages enable row level security;
    alter table public.chat_invitations enable row level security;
  end if;
end $$;

-- ---------- COLUMN PRIVILEGES ----------
-- RLS controls rows; column grants prevent accidental credential leakage.
revoke all on table public.players from anon, authenticated;
grant select (name, role, created) on public.players to anon, authenticated;
grant update (auth_user_id) on public.players to authenticated;

-- ---------- CORE LEAGUE POLICIES ----------
create policy players_public_read on public.players for select to anon using (true);
create policy players_auth_read on public.players for select to authenticated using (true);
create policy players_admin_link_auth on public.players for update to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy seasons_public_read on public.seasons for select to anon using (true);
create policy seasons_auth_read on public.seasons for select to authenticated using (true);
create policy seasons_admin_write on public.seasons for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy matches_public_read on public.matches for select to anon using (true);
create policy matches_auth_read on public.matches for select to authenticated using (true);
create policy matches_admin_write on public.matches for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy standings_public_read on public.standings for select to anon using (true);
create policy standings_auth_read on public.standings for select to authenticated using (true);

create policy achievements_public_read on public.achievements for select to anon using (true);
create policy achievements_auth_read on public.achievements for select to authenticated using (true);

create policy match_stats_public_read on public.match_stats for select to anon using (true);
create policy match_stats_auth_read on public.match_stats for select to authenticated using (true);
create policy match_stats_admin_write on public.match_stats for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy goal_events_public_read on public.match_goal_events for select to anon using (true);
create policy goal_events_auth_read on public.match_goal_events for select to authenticated using (true);
create policy goal_events_admin_write on public.match_goal_events for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy questions_public_read on public.questions for select to anon using (true);
create policy questions_auth_read on public.questions for select to authenticated using (true);
create policy questions_insert_self on public.questions for insert to authenticated
  with check (author = public.current_player_name());
create policy questions_update_owner on public.questions for update to authenticated
  using (author = public.current_player_name() or public.is_league_admin())
  with check (author = public.current_player_name() or public.is_league_admin());
create policy questions_delete_owner on public.questions for delete to authenticated
  using (author = public.current_player_name() or public.is_league_admin());

create policy answers_public_read on public.answers for select to anon using (true);
create policy answers_auth_read on public.answers for select to authenticated using (true);
create policy answers_insert_self on public.answers for insert to authenticated
  with check (author = public.current_player_name());
create policy answers_update_owner on public.answers for update to authenticated
  using (author = public.current_player_name() or public.is_league_admin())
  with check (author = public.current_player_name() or public.is_league_admin());
create policy answers_delete_owner on public.answers for delete to authenticated
  using (author = public.current_player_name() or public.is_league_admin());

-- ---------- CHAT POLICIES ----------
do $$
begin
  if to_regclass('public.chat_groups') is null then return; end if;

  execute $p$create policy chat_groups_member_read on public.chat_groups for select to authenticated
    using (created_by = public.current_player_name() or exists (
      select 1 from public.chat_group_members m
      where m.group_id = chat_groups.id and m.player = public.current_player_name()))$p$;
  execute $p$create policy chat_groups_create_self on public.chat_groups for insert to authenticated
    with check (created_by = public.current_player_name())$p$;
  execute $p$create policy chat_groups_owner_update on public.chat_groups for update to authenticated
    using (created_by = public.current_player_name() or public.is_league_admin())
    with check (created_by = public.current_player_name() or public.is_league_admin())$p$;
  execute $p$create policy chat_groups_owner_delete on public.chat_groups for delete to authenticated
    using (created_by = public.current_player_name() or public.is_league_admin())$p$;

  execute $p$create policy chat_members_member_read on public.chat_group_members for select to authenticated
    using (player = public.current_player_name() or exists (
      select 1 from public.chat_group_members mine
      where mine.group_id = chat_group_members.group_id and mine.player = public.current_player_name()))$p$;
  execute $p$create policy chat_members_insert on public.chat_group_members for insert to authenticated
    with check (player = public.current_player_name() or exists (
      select 1 from public.chat_groups g
      where g.id = chat_group_members.group_id and g.created_by = public.current_player_name()))$p$;
  execute $p$create policy chat_members_delete on public.chat_group_members for delete to authenticated
    using (player = public.current_player_name() or public.is_league_admin() or exists (
      select 1 from public.chat_groups g
      where g.id = chat_group_members.group_id and g.created_by = public.current_player_name()))$p$;

  execute $p$create policy chat_messages_member_read on public.chat_messages for select to authenticated
    using (exists (select 1 from public.chat_group_members m
      where m.group_id = chat_messages.group_id and m.player = public.current_player_name()))$p$;
  execute $p$create policy chat_messages_member_insert on public.chat_messages for insert to authenticated
    with check (author = public.current_player_name() and exists (
      select 1 from public.chat_group_members m
      where m.group_id = chat_messages.group_id and m.player = public.current_player_name()))$p$;
  execute $p$create policy chat_messages_author_delete on public.chat_messages for delete to authenticated
    using (author = public.current_player_name() or public.is_league_admin())$p$;

  execute $p$create policy chat_invites_involved_read on public.chat_invitations for select to authenticated
    using (invited_player = public.current_player_name() or invited_by = public.current_player_name())$p$;
  execute $p$create policy chat_invites_member_insert on public.chat_invitations for insert to authenticated
    with check (invited_by = public.current_player_name() and exists (
      select 1 from public.chat_group_members m
      where m.group_id = chat_invitations.group_id and m.player = public.current_player_name()))$p$;
  execute $p$create policy chat_invites_recipient_update on public.chat_invitations for update to authenticated
    using (invited_player = public.current_player_name())
    with check (invited_player = public.current_player_name())$p$;
  execute $p$create policy chat_invites_involved_delete on public.chat_invitations for delete to authenticated
    using (invited_player = public.current_player_name() or invited_by = public.current_player_name() or public.is_league_admin())$p$;
end $$;

-- ---------- SERVER-DERIVED STANDINGS ----------
create or replace function public.refresh_league_standings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.standings;

  insert into public.standings
    (season, player, played, wins, draws, losses, goals_for, goals_against, goal_diff, points, rank, updated_at)
  with expanded as (
    select player1 player, goals1 gf, goals2 ga from public.matches
    union all
    select player2 player, goals2 gf, goals1 ga from public.matches
  ), agg as (
    select p.name player,
      count(e.player)::int played,
      count(*) filter (where e.gf > e.ga)::int wins,
      count(*) filter (where e.gf = e.ga and e.player is not null)::int draws,
      count(*) filter (where e.gf < e.ga)::int losses,
      coalesce(sum(e.gf),0)::int goals_for,
      coalesce(sum(e.ga),0)::int goals_against
    from public.players p left join expanded e on e.player = p.name
    group by p.name
  ), ranked as (
    select *, (goals_for-goals_against)::int goal_diff, (wins*3+draws)::int points,
      row_number() over (order by (wins*3+draws) desc, (goals_for-goals_against) desc, goals_for desc, player asc)::int rank
    from agg
  )
  select 'all', player, played, wins, draws, losses, goals_for, goals_against, goal_diff, points, rank, now()
  from ranked;

  insert into public.standings
    (season, player, played, wins, draws, losses, goals_for, goals_against, goal_diff, points, rank, updated_at)
  with season_players as (
    select s.id season_id, p.name player from public.seasons s cross join public.players p
  ), expanded as (
    select season_id, player1 player, goals1 gf, goals2 ga from public.matches
    union all
    select season_id, player2 player, goals2 gf, goals1 ga from public.matches
  ), agg as (
    select sp.season_id, sp.player,
      count(e.player)::int played,
      count(*) filter (where e.gf > e.ga)::int wins,
      count(*) filter (where e.gf = e.ga and e.player is not null)::int draws,
      count(*) filter (where e.gf < e.ga)::int losses,
      coalesce(sum(e.gf),0)::int goals_for,
      coalesce(sum(e.ga),0)::int goals_against
    from season_players sp left join expanded e on e.season_id = sp.season_id and e.player = sp.player
    group by sp.season_id, sp.player
  ), ranked as (
    select *, (goals_for-goals_against)::int goal_diff, (wins*3+draws)::int points,
      row_number() over (partition by season_id order by (wins*3+draws) desc, (goals_for-goals_against) desc, goals_for desc, player asc)::int rank
    from agg
  )
  select season_id::text, player, played, wins, draws, losses, goals_for, goals_against, goal_diff, points, rank, now()
  from ranked;
end;
$$;

revoke all on function public.refresh_league_standings() from public, anon, authenticated;

-- ---------- SERVER-DERIVED ACHIEVEMENTS ----------
create or replace function public.refresh_league_achievements()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.achievements;

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
    from public.players p left join expanded e on e.player = p.name group by p.name
  )
  insert into public.achievements (player, achievement_id)
  select player, achievement_id from agg
  cross join lateral (values
    ('first_win', wins >= 1), ('wins10', wins >= 10), ('goals50', goals_for >= 50),
    ('goals100', goals_for >= 100), ('played20', played >= 20), ('clean5', clean_sheets >= 5)
  ) a(achievement_id, unlocked)
  where unlocked;

  with expanded as (
    select id, player1 player, (goals1 > goals2) won, timestamp from public.matches
    union all
    select id, player2 player, (goals2 > goals1) won, timestamp from public.matches
  ), ordered as (
    select *, sum(case when won then 0 else 1 end)
      over (partition by player order by timestamp, id rows unbounded preceding) grp
    from expanded
  ), streaks as (
    select player, grp, count(*)::int wins from ordered where won group by player, grp
  ), best as (
    select player, max(wins)::int best_streak from streaks group by player
  )
  insert into public.achievements (player, achievement_id)
  select player, 'streak5' from best where best_streak >= 5 on conflict do nothing;

  with expanded as (
    select season_id, player1 player, goals1 gf, goals2 ga from public.matches where season_id is not null
    union all
    select season_id, player2 player, goals2 gf, goals1 ga from public.matches where season_id is not null
  ), agg as (
    select season_id, player, count(*)::int played,
      count(*) filter (where gf > ga)::int wins,
      count(*) filter (where gf = ga)::int draws,
      sum(gf)::int goals_for, sum(ga)::int goals_against
    from expanded group by season_id, player
  ), ranked as (
    select *, row_number() over (partition by season_id
      order by (wins*3+draws) desc, (goals_for-goals_against) desc, goals_for desc, player asc) rank
    from agg where played > 0
  )
  insert into public.achievements (player, achievement_id)
  select distinct player, 'champion' from ranked where rank = 1 on conflict do nothing;
end;
$$;

revoke all on function public.refresh_league_achievements() from public, anon, authenticated;

-- ---------- DERIVED-DATA TRIGGERS ----------
create or replace function public.trg_refresh_league_derived()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_league_standings();
  perform public.refresh_league_achievements();
  return null;
end;
$$;

drop trigger if exists matches_refresh_standings on public.matches;
drop trigger if exists players_refresh_standings on public.players;
drop trigger if exists zz_matches_refresh_achievements on public.matches;
drop trigger if exists zz_players_refresh_achievements on public.players;
drop trigger if exists matches_refresh_derived on public.matches;
drop trigger if exists players_refresh_derived on public.players;

create trigger matches_refresh_derived
after insert or update or delete on public.matches
for each statement execute function public.trg_refresh_league_derived();

create trigger players_refresh_derived
after insert or update of name or delete on public.players
for each statement execute function public.trg_refresh_league_derived();

perform public.refresh_league_standings();
perform public.refresh_league_achievements();

commit;

-- ---------- ACCOUNT MIGRATION ----------
-- Create one Supabase Auth user per player, then link auth.users.id to
-- public.players.auth_user_id. Rotate every password that ever appeared in Git
-- history. After every profile is linked, permanently remove the legacy column:
--   alter table public.players drop column if exists password;
