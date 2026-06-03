-- Run once in Supabase SQL Editor (adds in-game player name per stat row)
alter table public.match_stats
  add column if not exists character_name text not null default '';
