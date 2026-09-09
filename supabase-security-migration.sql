-- =====================================================
-- eFootball Friends League — security + architecture migration
-- Run ONCE in Supabase SQL Editor after deploying the matching frontend.
-- This migration preserves league data. It does NOT drop existing tables.
-- =====================================================

begin;

-- 1) Player profiles are no longer credential storage.
alter table public.players add column if not exists auth_user_id uuid unique;
alter table public.players add column if not exists role text not null default 'player';
alter table public.players drop constraint if exists players_role_check;
alter table public.players add constraint players_role_check check (role in ('admin', 'player'));

-- Keep the legacy password column temporarily nullable so the migration is non-destructive.
-- The frontend stops reading/writing it immediately. Drop it after every account has migrated.
alter table public.players alter column password drop not null;

-- Make Wael the application admin profile. Admin capability is enforced by RLS, not browser UI.
update public.players set role = 'admin' where name = 'Wael';
update public.players set role = 'player' where name <> 'Wael' and role is distinct from 'player';

-- Helper functions are SECURITY DEFINER only for identity lookup. They do not accept arbitrary ids.
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

-- 2) Remove the old allow-everything policies.
do $$
declare t text;
begin
  foreach t in array array[
    'players','seasons','matches','standings','achievements','questions','answers',
    'match_stats','match_goal_events','chat_groups','chat_group_members','chat_messages','chat_invitations'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "public_all_%1$s" on public.%1$s;', t);
    end if;
  end loop;
end $$;

-- 3) Core league RLS.
alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.matches enable row level security;
alter table public.standings enable row level security;
alter table public.achievements enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.match_stats enable row level security;
alter table public.match_goal_events enable row level security;

-- Public hub may read non-sensitive league data without login.
create policy players_public_roster on public.players for select to anon using (true);
create policy players_authenticated_roster on public.players for select to authenticated using (true);

create policy seasons_public_read on public.seasons for select to anon using (true);
create policy seasons_authenticated_read on public.seasons for select to authenticated using (true);
create policy seasons_admin_write on public.seasons for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy matches_public_read on public.matches for select to anon using (true);
create policy matches_authenticated_read on public.matches for select to authenticated using (true);
create policy matches_admin_write on public.matches for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy standings_public_read on public.standings for select to anon using (true);
create policy standings_authenticated_read on public.standings for select to authenticated using (true);

create policy achievements_public_read on public.achievements for select to anon using (true);
create policy achievements_authenticated_read on public.achievements for select to authenticated using (true);
create policy achievements_admin_write on public.achievements for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy match_stats_public_read on public.match_stats for select to anon using (true);
create policy match_stats_authenticated_read on public.match_stats for select to authenticated using (true);
create policy match_stats_admin_write on public.match_stats for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

create policy goal_events_public_read on public.match_goal_events for select to anon using (true);
create policy goal_events_authenticated_read on public.match_goal_events for select to authenticated using (true);
create policy goal_events_admin_write on public.match_goal_events for all to authenticated
  using (public.is_league_admin()) with check (public.is_league_admin());

-- Q&A: signed-in league players can participate; authors own their content. Admin may moderate.
create policy questions_public_read on public.questions for select to anon using (true);
create policy questions_authenticated_read on public.questions for select to authenticated using (true);
create policy questions_insert_self on public.questions for insert to authenticated
  with check (author = public.current_player_name());
create policy questions_update_author on public.questions for update to authenticated
  using (author = public.current_player_name() or public.is_league_admin())
  with check (author = public.current_player_name() or public.is_league_admin());
create policy questions_delete_author_or_admin on public.questions for delete to authenticated
  using (author = public.current_player_name() or public.is_league_admin());

create policy answers_public_read on public.answers for select to anon using (true);
create policy answers_authenticated_read on public.answers for select to authenticated using (true);
create policy answers_insert_self on public.answers for insert to authenticated
  with check (author = public.current_player_name());
create policy answers_update_author on public.answers for update to authenticated
  using (author = public.current_player_name() or public.is_league_admin())
  with check (author = public.current_player_name() or public.is_league_admin());
create policy answers_delete_author_or_admin on public.answers for delete to authenticated
  using (author = public.current_player_name() or public.is_league_admin());

-- 4) Chat RLS. Membership is enforced in Postgres.
do $$
begin
  if to_regclass('public.chat_groups') is not null then
    alter table public.chat_groups enable row level security;
    alter table public.chat_group_members enable row level security;
    alter table public.chat_messages enable row level security;
    alter table public.chat_invitations enable row level security;
  end if;
end $$;

create policy chat_groups_member_read on public.chat_groups for select to authenticated
using (
  created_by = public.current_player_name()
  or exists (
    select 1 from public.chat_group_members m
    where m.group_id = chat_groups.id and m.player = public.current_player_name()
  )
);
create policy chat_groups_create_self on public.chat_groups for insert to authenticated
with check (created_by = public.current_player_name());
create policy chat_groups_owner_update on public.chat_groups for update to authenticated
using (created_by = public.current_player_name() or public.is_league_admin())
with check (created_by = public.current_player_name() or public.is_league_admin());
create policy chat_groups_owner_delete on public.chat_groups for delete to authenticated
using (created_by = public.current_player_name() or public.is_league_admin());

create policy chat_members_member_read on public.chat_group_members for select to authenticated
using (
  player = public.current_player_name()
  or exists (
    select 1 from public.chat_group_members mine
    where mine.group_id = chat_group_members.group_id and mine.player = public.current_player_name()
  )
);
create policy chat_members_join_self_or_owner on public.chat_group_members for insert to authenticated
with check (
  player = public.current_player_name()
  or exists (
    select 1 from public.chat_groups g
    where g.id = chat_group_members.group_id and g.created_by = public.current_player_name()
  )
);
create policy chat_members_leave_self_or_owner on public.chat_group_members for delete to authenticated
using (
  player = public.current_player_name()
  or exists (
    select 1 from public.chat_groups g
    where g.id = chat_group_members.group_id and g.created_by = public.current_player_name()
  )
  or public.is_league_admin()
);

create policy chat_messages_member_read on public.chat_messages for select to authenticated
using (
  exists (
    select 1 from public.chat_group_members m
    where m.group_id = chat_messages.group_id and m.player = public.current_player_name()
  )
);
create policy chat_messages_member_insert on public.chat_messages for insert to authenticated
with check (
  author = public.current_player_name()
  and exists (
    select 1 from public.chat_group_members m
    where m.group_id = chat_messages.group_id and m.player = public.current_player_name()
  )
);
create policy chat_messages_author_delete on public.chat_messages for delete to authenticated
using (author = public.current_player_name() or public.is_league_admin());

create policy chat_invites_involved_read on public.chat_invitations for select to authenticated
using (invited_player = public.current_player_name() or invited_by = public.current_player_name());
create policy chat_invites_member_insert on public.chat_invitations for insert to authenticated
with check (
  invited_by = public.current_player_name()
  and exists (
    select 1 from public.chat_group_members m
    where m.group_id = chat_invitations.group_id and m.player = public.current_player_name()
  )
);
create policy chat_invites_recipient_update on public.chat_invitations for update to authenticated
using (invited_player = public.current_player_name())
with check (invited_player = public.current_player_name());
create policy chat_invites_involved_delete on public.chat_invitations for delete to authenticated
using (invited_player = public.current_player_name() or invited_by = public.current_player_name() or public.is_league_admin());

-- 5) Server-side standings calculation. The browser no longer deletes/reinserts the table.
create or replace function public.refresh_league_standings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.standings;

  -- All-time standings.
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
    select *, (goals_for-goals_against)::int goal_diff,
      (wins*3+draws)::int points,
      row_number() over (order by (wins*3+draws) desc, (goals_for-goals_against) desc, goals_for desc, player asc)::int rank
    from agg
  )
  select 'all', player, played, wins, draws, losses, goals_for, goals_against, goal_diff, points, rank, now()
  from ranked;

  -- Per-season standings.
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
    from season_players sp
    left join expanded e on e.season_id = sp.season_id and e.player = sp.player
    group by sp.season_id, sp.player
  ), ranked as (
    select *, (goals_for-goals_against)::int goal_diff,
      (wins*3+draws)::int points,
      row_number() over (partition by season_id order by (wins*3+draws) desc, (goals_for-goals_against) desc, goals_for desc, player asc)::int rank
    from agg
  )
  select season_id::text, player, played, wins, draws, losses, goals_for, goals_against, goal_diff, points, rank, now()
  from ranked;
end;
$$;

revoke all on function public.refresh_league_standings() from public, anon, authenticated;

create or replace function public.trg_refresh_league_standings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_league_standings();
  return null;
end;
$$;

drop trigger if exists matches_refresh_standings on public.matches;
create trigger matches_refresh_standings
after insert or update or delete on public.matches
for each statement execute function public.trg_refresh_league_standings();

drop trigger if exists players_refresh_standings on public.players;
create trigger players_refresh_standings
after insert or update of name or delete on public.players
for each statement execute function public.trg_refresh_league_standings();

perform public.refresh_league_standings();

commit;

-- =====================================================
-- ACCOUNT MIGRATION NOTES
-- =====================================================
-- 1. In Supabase Authentication, create one user for each player using the deterministic
--    address shown by the UI: lowercase-slug@efootball-friends.example.
-- 2. Link auth.users.id to public.players.auth_user_id.
-- 3. Verify every player can sign in.
-- 4. Then permanently remove legacy credentials:
--      update public.players set password = null;
--      alter table public.players drop column password;
-- 5. Rotate every password that ever appeared in Git history.
-- =====================================================
