-- Add presentation metadata without rewriting squads, goals, matches or identities.
begin;
alter table public.squad_players
  add column if not exists shirt_number integer,
  add column if not exists rating numeric(4,1),
  add column if not exists photo_url text,
  add column if not exists updated_at timestamptz;
alter table public.squad_players drop constraint if exists squad_players_position_check;
alter table public.squad_players add constraint squad_players_position_check check (position in ('GK','DF','MF','FW','SUB','UNK'));
alter table public.squad_players alter column position set default 'UNK';
alter table public.squad_players drop constraint if exists squad_players_shirt_number_check;
alter table public.squad_players add constraint squad_players_shirt_number_check check (shirt_number between 0 and 99);
alter table public.squad_players drop constraint if exists squad_players_rating_check;
alter table public.squad_players add constraint squad_players_rating_check check (rating between 0 and 120);
alter table public.squad_players drop constraint if exists squad_players_photo_url_check;
alter table public.squad_players add constraint squad_players_photo_url_check check (photo_url is null or (photo_url ~ '^https://' and char_length(photo_url) <= 2048));
grant insert(shirt_number,rating,photo_url), update(shirt_number,rating,photo_url) on public.squad_players to authenticated;
-- Preserve existing owner/admin RLS and column grants. No client can forge this date.
-- Older rows remain NULL: their actual last-edit time was never recorded.
create or replace function private.touch_squad_player()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP = 'INSERT' then new.updated_at := clock_timestamp();
  elsif new is distinct from old then new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function private.touch_squad_player() from public,anon,authenticated;
drop trigger if exists squad_player_updated_at on public.squad_players;
create trigger squad_player_updated_at before insert or update on public.squad_players
for each row execute function private.touch_squad_player();
notify pgrst, 'reload schema';
commit;
