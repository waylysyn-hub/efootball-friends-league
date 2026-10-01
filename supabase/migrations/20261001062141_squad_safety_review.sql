-- Fail closed for unmapped sessions and preserve referenced squad images/history.
-- Schema-only: no existing player, match, goal or image is changed.
begin;

create or replace function public.delete_squad_player(target uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  member public.squad_players%rowtype;
  caller_name text := (select private.current_player_name());
begin
  if (select auth.uid()) is null or caller_name is null then
    raise insufficient_privilege;
  end if;

  select * into member from public.squad_players where id=target for update;
  if not found then raise exception 'EFL_SQUAD_PLAYER_NOT_FOUND'; end if;
  if (member.owner=caller_name or (select private.is_league_admin())) is not true then
    raise insufficient_privilege;
  end if;

  if exists (
    select 1 from public.match_goal_events e
    where e.scorer_id=target or e.assist_id=target
      or (e.owner=member.owner and (
        (e.scorer_id is null and lower(btrim(e.scorer))=lower(btrim(member.name)))
        or (e.assist_id is null and lower(btrim(e.assist))=lower(btrim(member.name)))
      ))
  ) then
    raise exception 'EFL_SQUAD_PLAYER_HISTORY';
  end if;

  delete from public.squad_players where id=target;
  return member.photo_path;
end;
$$;
revoke all on function public.delete_squad_player(uuid) from public,anon;
grant execute on function public.delete_squad_player(uuid) to authenticated;

-- AND this with the existing owner/admin policy, including for old frontend tabs.
create index if not exists squad_players_photo_path_idx on public.squad_players(photo_path) where photo_path is not null;
drop policy if exists squad_player_images_preserve_references on storage.objects;
create policy squad_player_images_preserve_references
on storage.objects as restrictive for delete to authenticated
using (
  bucket_id <> 'squad-player-images'
  or not exists (select 1 from public.squad_players s where s.photo_path=storage.objects.name)
);

notify pgrst, 'reload schema';
commit;
