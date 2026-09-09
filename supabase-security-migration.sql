-- =====================================================
-- eFootball Friends League — SECURITY / AUTHORIZATION MIGRATION
-- Safe for existing installations. Run after chat table migration.
-- =====================================================

begin;

-- ---------- PROFILE + AUTH MAPPING ----------
alter table public.players add column if not exists role text not null default 'player';
alter table public.players drop constraint if exists players_role_check;
alter table public.players add constraint players_role_check check (role in ('admin','player'));
update public.players set role = case when name='Wael' then 'admin' else 'player' end;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='players' and column_name='password'
  ) then
    alter table public.players alter column password drop not null;
  end if;
end $$;

create table if not exists public.player_accounts (
  name text primary key references public.players(name) on update cascade on delete cascade,
  auth_user_id uuid not null unique
);

-- Migrate an earlier auth_user_id column if present, then remove it from the public roster.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='players' and column_name='auth_user_id'
  ) then
    execute 'insert into public.player_accounts(name,auth_user_id)
             select name,auth_user_id from public.players where auth_user_id is not null
             on conflict(name) do update set auth_user_id=excluded.auth_user_id';
    alter table public.players drop column auth_user_id;
  end if;
end $$;

-- ---------- PRIVATE AUTH HELPERS ----------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.current_player_name()
returns text language sql stable security definer set search_path=''
as $$
  select pa.name from public.player_accounts pa
  where pa.auth_user_id=(select auth.uid()) limit 1
$$;

create or replace function private.current_player_role()
returns text language sql stable security definer set search_path=''
as $$
  select p.role from public.players p
  where p.name=(select private.current_player_name()) limit 1
$$;

create or replace function private.is_league_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce((select private.current_player_role())='admin',false) $$;

create or replace function private.is_chat_member(target_group uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.chat_group_members m
    where m.group_id=target_group and m.player=(select private.current_player_name())
  )
$$;

create or replace function private.is_chat_owner(target_group uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.chat_groups g
    where g.id=target_group and g.created_by=(select private.current_player_name())
  )
$$;

revoke all on function private.current_player_name() from public;
revoke all on function private.current_player_role() from public;
revoke all on function private.is_league_admin() from public;
revoke all on function private.is_chat_member(uuid) from public;
revoke all on function private.is_chat_owner(uuid) from public;
grant execute on function private.current_player_name() to authenticated;
grant execute on function private.current_player_role() to authenticated;
grant execute on function private.is_league_admin() to authenticated;
grant execute on function private.is_chat_member(uuid) to authenticated;
grant execute on function private.is_chat_owner(uuid) to authenticated;

-- ---------- REMOVE LEGACY POLICIES ----------
do $$
declare r record;
begin
  for r in
    select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename=any(array[
      'players','player_accounts','seasons','matches','standings','achievements','questions','answers',
      'match_stats','match_goal_events','chat_groups','chat_group_members','chat_messages','chat_invitations'
    ])
  loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

-- ---------- RLS + GRANTS ----------
alter table public.players enable row level security;
alter table public.player_accounts enable row level security;
alter table public.seasons enable row level security;
alter table public.matches enable row level security;
alter table public.standings enable row level security;
alter table public.achievements enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.match_stats enable row level security;
alter table public.match_goal_events enable row level security;
alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_invitations enable row level security;

revoke all on table public.players,public.player_accounts,public.seasons,public.matches,
  public.standings,public.achievements,public.questions,public.answers,
  public.match_stats,public.match_goal_events,public.chat_groups,public.chat_group_members,
  public.chat_messages,public.chat_invitations from anon,authenticated;

grant select(name,role,created) on public.players to anon,authenticated;
grant select(name) on public.player_accounts to authenticated;
grant select on public.seasons,public.matches,public.standings,public.achievements,
  public.questions,public.answers,public.match_stats,public.match_goal_events to anon;
grant select,insert,update,delete on public.seasons,public.matches,public.questions,
  public.answers,public.match_stats,public.match_goal_events to authenticated;
grant select on public.standings,public.achievements to authenticated;
grant select,insert,update,delete on public.chat_groups,public.chat_invitations to authenticated;
grant select,insert,delete on public.chat_group_members,public.chat_messages to authenticated;

-- ---------- ROSTER / ACCOUNT MAPPING ----------
create policy players_public_read on public.players for select to anon using (true);
create policy players_auth_read on public.players for select to authenticated using (true);
create policy player_accounts_read_self on public.player_accounts for select to authenticated
  using (auth_user_id=(select auth.uid()));

-- ---------- ADMIN-OWNED LEAGUE DATA ----------
create policy seasons_public_read on public.seasons for select to anon using (true);
create policy seasons_auth_read on public.seasons for select to authenticated using (true);
create policy seasons_admin_insert on public.seasons for insert to authenticated with check ((select private.is_league_admin()));
create policy seasons_admin_update on public.seasons for update to authenticated using ((select private.is_league_admin())) with check ((select private.is_league_admin()));
create policy seasons_admin_delete on public.seasons for delete to authenticated using ((select private.is_league_admin()));

create policy matches_public_read on public.matches for select to anon using (true);
create policy matches_auth_read on public.matches for select to authenticated using (true);
create policy matches_admin_insert on public.matches for insert to authenticated with check ((select private.is_league_admin()));
create policy matches_admin_update on public.matches for update to authenticated using ((select private.is_league_admin())) with check ((select private.is_league_admin()));
create policy matches_admin_delete on public.matches for delete to authenticated using ((select private.is_league_admin()));

create policy standings_public_read on public.standings for select to anon using (true);
create policy standings_auth_read on public.standings for select to authenticated using (true);
create policy achievements_public_read on public.achievements for select to anon using (true);
create policy achievements_auth_read on public.achievements for select to authenticated using (true);

create policy match_stats_public_read on public.match_stats for select to anon using (true);
create policy match_stats_auth_read on public.match_stats for select to authenticated using (true);
create policy match_stats_admin_insert on public.match_stats for insert to authenticated with check ((select private.is_league_admin()));
create policy match_stats_admin_update on public.match_stats for update to authenticated using ((select private.is_league_admin())) with check ((select private.is_league_admin()));
create policy match_stats_admin_delete on public.match_stats for delete to authenticated using ((select private.is_league_admin()));

create policy goal_events_public_read on public.match_goal_events for select to anon using (true);
create policy goal_events_auth_read on public.match_goal_events for select to authenticated using (true);
create policy goal_events_admin_insert on public.match_goal_events for insert to authenticated with check ((select private.is_league_admin()));
create policy goal_events_admin_update on public.match_goal_events for update to authenticated using ((select private.is_league_admin())) with check ((select private.is_league_admin()));
create policy goal_events_admin_delete on public.match_goal_events for delete to authenticated using ((select private.is_league_admin()));

-- ---------- Q&A OWNERSHIP ----------
create policy questions_public_read on public.questions for select to anon using (true);
create policy questions_auth_read on public.questions for select to authenticated using (true);
create policy questions_insert_self on public.questions for insert to authenticated
  with check (author=(select private.current_player_name()));
create policy questions_update_owner on public.questions for update to authenticated
  using (author=(select private.current_player_name()) or (select private.is_league_admin()))
  with check (author=(select private.current_player_name()) or (select private.is_league_admin()));
create policy questions_delete_owner on public.questions for delete to authenticated
  using (author=(select private.current_player_name()) or (select private.is_league_admin()));

create policy answers_public_read on public.answers for select to anon using (true);
create policy answers_auth_read on public.answers for select to authenticated using (true);
create policy answers_insert_self on public.answers for insert to authenticated
  with check (author=(select private.current_player_name()));
create policy answers_update_owner on public.answers for update to authenticated
  using (author=(select private.current_player_name()) or (select private.is_league_admin()))
  with check (author=(select private.current_player_name()) or (select private.is_league_admin()));
create policy answers_delete_owner on public.answers for delete to authenticated
  using (author=(select private.current_player_name()) or (select private.is_league_admin()));

-- ---------- GROUP CHAT ----------
create policy chat_groups_member_read on public.chat_groups for select to authenticated
  using (created_by=(select private.current_player_name()) or (select private.is_chat_member(id)));
create policy chat_groups_create_self on public.chat_groups for insert to authenticated
  with check (created_by=(select private.current_player_name()));
create policy chat_groups_owner_update on public.chat_groups for update to authenticated
  using ((select private.is_chat_owner(id)) or (select private.is_league_admin()))
  with check ((select private.is_chat_owner(id)) or (select private.is_league_admin()));
create policy chat_groups_owner_delete on public.chat_groups for delete to authenticated
  using ((select private.is_chat_owner(id)) or (select private.is_league_admin()));

create policy chat_members_member_read on public.chat_group_members for select to authenticated
  using (player=(select private.current_player_name()) or (select private.is_chat_member(group_id)));
create policy chat_members_insert on public.chat_group_members for insert to authenticated
  with check (
    (select private.is_chat_owner(group_id))
    or (
      player=(select private.current_player_name())
      and exists(
        select 1 from public.chat_invitations i
        where i.group_id=chat_group_members.group_id
          and i.invited_player=chat_group_members.player
          and i.status='accepted'
      )
    )
  );
create policy chat_members_delete on public.chat_group_members for delete to authenticated
  using (player=(select private.current_player_name()) or (select private.is_chat_owner(group_id)) or (select private.is_league_admin()));

create policy chat_messages_member_read on public.chat_messages for select to authenticated
  using ((select private.is_chat_member(group_id)));
create policy chat_messages_member_insert on public.chat_messages for insert to authenticated
  with check (author=(select private.current_player_name()) and (select private.is_chat_member(group_id)));
create policy chat_messages_author_delete on public.chat_messages for delete to authenticated
  using (author=(select private.current_player_name()) or (select private.is_league_admin()));

create policy chat_invites_involved_read on public.chat_invitations for select to authenticated
  using (invited_player=(select private.current_player_name()) or invited_by=(select private.current_player_name()));
create policy chat_invites_member_insert on public.chat_invitations for insert to authenticated
  with check (invited_by=(select private.current_player_name()) and invited_player<>invited_by and (select private.is_chat_member(group_id)));
create policy chat_invites_recipient_update on public.chat_invitations for update to authenticated
  using (invited_player=(select private.current_player_name()))
  with check (invited_player=(select private.current_player_name()) and status in ('accepted','rejected'));
create policy chat_invites_involved_delete on public.chat_invitations for delete to authenticated
  using (invited_player=(select private.current_player_name()) or invited_by=(select private.current_player_name()) or (select private.is_league_admin()));

-- Prevent accidental function exposure in future migrations.
alter default privileges for role postgres in schema public
  revoke execute on functions from public,anon,authenticated;

commit;
