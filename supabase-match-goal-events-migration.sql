-- Run once in Supabase SQL Editor (goal-by-goal match tracking)
create table if not exists public.match_goal_events (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  owner      text not null,
  scorer     text not null,
  assist     text not null default '',
  minute     integer not null default 0 check (minute >= 0 and minute <= 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists match_goal_events_match_idx on public.match_goal_events(match_id);

alter table public.match_goal_events enable row level security;

drop policy if exists "public_all_match_goal_events" on public.match_goal_events;
create policy "public_all_match_goal_events" on public.match_goal_events
  for all to anon, authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.match_goal_events;
  exception when duplicate_object then null;
end $$;
