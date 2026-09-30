-- Correct the managed WebP object-path constraint from the initial image rollout.
begin;

alter table public.squad_players
  drop constraint if exists squad_players_photo_path_check;

alter table public.squad_players
  add constraint squad_players_photo_path_check
  check (
    photo_path is null
    or (
      char_length(photo_path) <= 512
      and photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
    )
  );

notify pgrst, 'reload schema';
commit;
