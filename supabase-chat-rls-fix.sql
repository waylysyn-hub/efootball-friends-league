-- =====================================================
-- CHAT RLS RECURSION FIX
-- Run after supabase-security-migration.sql.
-- Uses SECURITY DEFINER membership helpers so policies never query the same
-- RLS-protected membership table recursively.
-- =====================================================

begin;

create or replace function public.is_chat_member(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_group_members m
    where m.group_id = target_group
      and m.player = public.current_player_name()
  )
$$;

create or replace function public.is_chat_owner(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_groups g
    where g.id = target_group
      and g.created_by = public.current_player_name()
  )
$$;

grant execute on function public.is_chat_member(uuid) to authenticated;
grant execute on function public.is_chat_owner(uuid) to authenticated;

drop policy if exists chat_groups_member_read on public.chat_groups;
drop policy if exists chat_groups_create_self on public.chat_groups;
drop policy if exists chat_groups_owner_update on public.chat_groups;
drop policy if exists chat_groups_owner_delete on public.chat_groups;
drop policy if exists chat_members_member_read on public.chat_group_members;
drop policy if exists chat_members_insert on public.chat_group_members;
drop policy if exists chat_members_delete on public.chat_group_members;
drop policy if exists chat_messages_member_read on public.chat_messages;
drop policy if exists chat_messages_member_insert on public.chat_messages;
drop policy if exists chat_messages_author_delete on public.chat_messages;
drop policy if exists chat_invites_involved_read on public.chat_invitations;
drop policy if exists chat_invites_member_insert on public.chat_invitations;
drop policy if exists chat_invites_recipient_update on public.chat_invitations;
drop policy if exists chat_invites_involved_delete on public.chat_invitations;

create policy chat_groups_member_read on public.chat_groups for select to authenticated
using (created_by = public.current_player_name() or public.is_chat_member(id));

create policy chat_groups_create_self on public.chat_groups for insert to authenticated
with check (created_by = public.current_player_name());

create policy chat_groups_owner_update on public.chat_groups for update to authenticated
using (public.is_chat_owner(id) or public.is_league_admin())
with check (public.is_chat_owner(id) or public.is_league_admin());

create policy chat_groups_owner_delete on public.chat_groups for delete to authenticated
using (public.is_chat_owner(id) or public.is_league_admin());

create policy chat_members_member_read on public.chat_group_members for select to authenticated
using (player = public.current_player_name() or public.is_chat_member(group_id));

create policy chat_members_insert on public.chat_group_members for insert to authenticated
with check (player = public.current_player_name() or public.is_chat_owner(group_id));

create policy chat_members_delete on public.chat_group_members for delete to authenticated
using (player = public.current_player_name() or public.is_chat_owner(group_id) or public.is_league_admin());

create policy chat_messages_member_read on public.chat_messages for select to authenticated
using (public.is_chat_member(group_id));

create policy chat_messages_member_insert on public.chat_messages for insert to authenticated
with check (author = public.current_player_name() and public.is_chat_member(group_id));

create policy chat_messages_author_delete on public.chat_messages for delete to authenticated
using (author = public.current_player_name() or public.is_league_admin());

create policy chat_invites_involved_read on public.chat_invitations for select to authenticated
using (invited_player = public.current_player_name() or invited_by = public.current_player_name());

create policy chat_invites_member_insert on public.chat_invitations for insert to authenticated
with check (invited_by = public.current_player_name() and public.is_chat_member(group_id));

create policy chat_invites_recipient_update on public.chat_invitations for update to authenticated
using (invited_player = public.current_player_name())
with check (invited_player = public.current_player_name());

create policy chat_invites_involved_delete on public.chat_invitations for delete to authenticated
using (invited_player = public.current_player_name() or invited_by = public.current_player_name() or public.is_league_admin());

commit;
