-- Private game nights: attendance and a single, persisted random draw.
-- The existing authenticated account mapping is the only admin authority.
create table if not exists public.league_evenings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  participants text[] not null,
  drawn_order text[] not null,
  season_id uuid references public.seasons(id) on delete set null,
  created_by text not null references public.players(name),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= created_at)
);
create unique index if not exists league_evenings_one_active on public.league_evenings ((true)) where ended_at is null;
create index if not exists league_evenings_created on public.league_evenings (created_at desc);
create index if not exists league_evenings_season on public.league_evenings (season_id);
create index if not exists league_evenings_creator on public.league_evenings (created_by);

alter table public.league_evenings enable row level security;
revoke all on public.league_evenings from public, anon, authenticated;
grant select on public.league_evenings to authenticated;
grant insert (id, title, participants, season_id) on public.league_evenings to authenticated;
grant update (ended_at) on public.league_evenings to authenticated;

drop policy if exists evening_admin_read on public.league_evenings;
create policy evening_admin_read on public.league_evenings for select to authenticated using ((select private.is_league_admin()));
drop policy if exists evening_admin_insert on public.league_evenings;
create policy evening_admin_insert on public.league_evenings for insert to authenticated with check (
  (select private.is_league_admin()) and created_by = (select private.current_player_name())
);
drop policy if exists evening_admin_close on public.league_evenings;
create policy evening_admin_close on public.league_evenings for update to authenticated
  using ((select private.is_league_admin())) with check ((select private.is_league_admin()));

-- Even direct inserts must validate attendance and generate the order on the
-- server. Clients cannot supply a draw, creator, timestamps, or an ended state.
create or replace function private.prepare_league_evening()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_league_admin() then raise insufficient_privilege; end if;
  if tg_op = 'INSERT' then
    new.title := btrim(new.title);
    if new.title is null or char_length(new.title) not between 1 and 80 then
      raise exception 'EFL_EVENING_TITLE';
    end if;
    if new.participants is null or coalesce(array_ndims(new.participants), 0) <> 1
      or cardinality(new.participants) not between 2 and 64
      or exists (select 1 from unnest(new.participants) as attendee(name)
        where name is null or not exists (select 1 from public.players p where p.name = attendee.name))
      or (select count(distinct name) from unnest(new.participants) as attendee(name)) <> cardinality(new.participants)
    then raise exception 'EFL_EVENING_ATTENDEES'; end if;
    select array_agg(name order by name) into new.participants from unnest(new.participants) as attendee(name);
    select array_agg(name order by random()) into new.drawn_order from unnest(new.participants) as attendee(name);
    new.created_by := private.current_player_name();
    new.created_at := now();
    new.ended_at := null;
  else
    if new.ended_at is null then raise exception 'EFL_EVENING_CLOSED'; end if;
    new.ended_at := coalesce(old.ended_at, now());
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_league_evening() from public, anon, authenticated;
drop trigger if exists prepare_league_evening on public.league_evenings;
create trigger prepare_league_evening before insert or update of ended_at on public.league_evenings
for each row execute function private.prepare_league_evening();

create or replace function public.start_league_evening(evening_id uuid, evening_title text, attendees text[], target_season uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved public.league_evenings;
  sorted_attendees text[];
begin
  if not private.is_league_admin() then raise insufficient_privilege; end if;
  if evening_id is null then raise exception 'EFL_EVENING_ATTENDEES'; end if;
  select array_agg(name order by name) into sorted_attendees from unnest(attendees) as attendee(name);
  select * into saved from public.league_evenings where id = evening_id;
  if not found then
    begin
      insert into public.league_evenings (id, title, participants, season_id)
      values (evening_id, evening_title, attendees, target_season)
      on conflict (id) do nothing returning * into saved;
    exception when unique_violation then
      raise exception 'EFL_EVENING_ACTIVE';
    end;
    if saved.id is null then
      select * into saved from public.league_evenings where id = evening_id;
    end if;
  end if;
  -- A retry returns the exact saved order, including after a lost response.
  if saved.title is distinct from btrim(evening_title)
    or saved.participants is distinct from sorted_attendees
    or saved.season_id is distinct from target_season then
    raise exception 'EFL_EVENING_CHANGED';
  end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.end_league_evening(target uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.league_evenings;
begin
  if not private.is_league_admin() then raise insufficient_privilege; end if;
  update public.league_evenings set ended_at = coalesce(ended_at, now()) where id = target returning * into saved;
  if not found then raise exception 'EFL_EVENING_MISSING'; end if;
  return to_jsonb(saved);
end;
$$;

revoke all on function public.start_league_evening(uuid, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.end_league_evening(uuid) from public, anon, authenticated;
grant execute on function public.start_league_evening(uuid, text, text[], uuid) to authenticated;
grant execute on function public.end_league_evening(uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'league_evenings') then
    alter publication supabase_realtime add table public.league_evenings;
  end if;
end $$;
