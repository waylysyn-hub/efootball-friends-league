-- Separate football position from lineup status.
begin;

alter table public.squad_players
  add column if not exists lineup_role text not null default 'starter';

-- Legacy SUB meant "reserve" but did not preserve the player's real football position.
-- Keep the reserve status and mark the unknown position honestly instead of guessing.
update public.squad_players
set lineup_role = 'substitute',
    position = 'UNK'
where position = 'SUB';

alter table public.squad_players drop constraint if exists squad_players_position_check;
alter table public.squad_players
  add constraint squad_players_position_check
  check (position in ('GK','DF','MF','FW','UNK'));

alter table public.squad_players drop constraint if exists squad_players_lineup_role_check;
alter table public.squad_players
  add constraint squad_players_lineup_role_check
  check (lineup_role in ('starter','substitute'));

grant insert(lineup_role), update(lineup_role) on public.squad_players to authenticated;

notify pgrst, 'reload schema';
commit;
