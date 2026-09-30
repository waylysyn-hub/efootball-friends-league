-- Managed public player images with owner/admin-only writes.
begin;

alter table public.squad_players
  add column if not exists photo_path text;

alter table public.squad_players drop constraint if exists squad_players_photo_path_check;
alter table public.squad_players
  add constraint squad_players_photo_path_check
  check (
    photo_path is null
    or (
      char_length(photo_path) <= 512
      and photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'
    )
  );

grant insert(photo_path), update(photo_path) on public.squad_players to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'squad-player-images',
  'squad-player-images',
  true,
  2097152,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "squad_player_images_select" on storage.objects;
create policy "squad_player_images_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'squad-player-images'
  and (
    (select private.is_league_admin())
    or (storage.foldername(name))[1] = (
      select p.id::text
      from public.players p
      where p.name = (select private.current_player_name())
      limit 1
    )
  )
);

drop policy if exists "squad_player_images_insert" on storage.objects;
create policy "squad_player_images_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'squad-player-images'
  and storage.extension(name) = 'webp'
  and (storage.foldername(name))[2] is not null
  and (
    (select private.is_league_admin())
    or (storage.foldername(name))[1] = (
      select p.id::text
      from public.players p
      where p.name = (select private.current_player_name())
      limit 1
    )
  )
);

drop policy if exists "squad_player_images_delete" on storage.objects;
create policy "squad_player_images_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'squad-player-images'
  and (
    (select private.is_league_admin())
    or (storage.foldername(name))[1] = (
      select p.id::text
      from public.players p
      where p.name = (select private.current_player_name())
      limit 1
    )
  )
);

notify pgrst, 'reload schema';
commit;
