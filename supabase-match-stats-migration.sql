-- =====================================================
--  MATCH PLAYER STATS — run once in Supabase SQL Editor
-- =====================================================

create table if not exists public.match_stats (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  player          text not null,
  character_name  text not null default '',
  goals           integer not null default 0 check (goals >= 0),
  assists         integer not null default 0 check (assists >= 0),
  unique (match_id, player)
);

create index if not exists match_stats_match_idx on public.match_stats(match_id);

alter table public.match_stats enable row level security;

drop policy if exists "public_all_match_stats" on public.match_stats;
-- Apply supabase-security-migration.sql after creating missing tables.

do $$
begin
  alter publication supabase_realtime add table public.match_stats;
  exception when duplicate_object then null;
end $$;
