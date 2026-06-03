-- =====================================================
--  eFOOTBALL FRIENDS LEAGUE — SUPABASE SCHEMA
--  Run this entire file in: Supabase Dashboard → SQL Editor → New query
-- =====================================================

-- ---------- Clean start (safe to re-run) ----------
drop table if exists public.match_goal_events cascade;
drop table if exists public.match_stats   cascade;
drop table if exists public.answers      cascade;
drop table if exists public.questions    cascade;
drop table if exists public.achievements cascade;
drop table if exists public.standings   cascade;
drop table if exists public.matches      cascade;
drop table if exists public.seasons      cascade;
drop table if exists public.players      cascade;

-- ---------- PLAYERS (accounts / roster) ----------
create table public.players (
  name      text primary key,
  password  text not null,
  created   bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ---------- SEASONS ----------
create table public.seasons (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  active    boolean not null default false,
  created   bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ---------- MATCHES ----------
create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  player1    text not null,
  player2    text not null,
  goals1     integer not null check (goals1 >= 0),
  goals2     integer not null check (goals2 >= 0),
  date       date not null,
  season_id  uuid references public.seasons(id) on delete cascade,
  timestamp  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  created_at timestamptz not null default now()
);

create index if not exists matches_season_idx on public.matches(season_id);

-- ---------- MATCH PLAYER STATS (goals / assists per player per match) ----------
create table public.match_stats (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.matches(id) on delete cascade,
  player          text not null,
  character_name  text not null default '',
  goals           integer not null default 0 check (goals >= 0),
  assists         integer not null default 0 check (assists >= 0),
  unique (match_id, player)
);

create index if not exists match_stats_match_idx on public.match_stats(match_id);

-- ---------- MATCH GOAL EVENTS (per-goal scorer / assist / minute) ----------
create table public.match_goal_events (
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

-- ---------- STANDINGS (auto-computed league table snapshot) ----------
-- `season` holds either a season uuid (as text) or the literal 'all' (overall table).
create table public.standings (
  season         text not null,
  player         text not null,
  played         integer not null default 0,
  wins           integer not null default 0,
  draws          integer not null default 0,
  losses         integer not null default 0,
  goals_for      integer not null default 0,
  goals_against  integer not null default 0,
  goal_diff      integer not null default 0,
  points         integer not null default 0,
  rank           integer not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (season, player)
);

-- ---------- LEAGUE Q&A ----------
create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  author             text not null,
  body               text not null,
  closed             boolean not null default false,
  correct_answer_id  uuid,
  created_at         timestamptz not null default now(),
  timestamp          bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table public.answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions(id) on delete cascade,
  author       text not null,
  body         text not null,
  created_at   timestamptz not null default now(),
  timestamp    bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists answers_question_idx on public.answers(question_id);

-- ---------- ACHIEVEMENTS (unlocked badges per player) ----------
create table public.achievements (
  player         text not null,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  primary key (player, achievement_id)
);

-- =====================================================
--  ROW LEVEL SECURITY
--  This is a shared app for a small group of friends using the public
--  anon key, so we allow the anon role full access to every table.
--  (Tighten these policies if you later add real per-user auth.)
-- =====================================================
alter table public.players      enable row level security;
alter table public.seasons      enable row level security;
alter table public.matches      enable row level security;
alter table public.standings    enable row level security;
alter table public.achievements enable row level security;
alter table public.questions    enable row level security;
alter table public.answers      enable row level security;
alter table public.match_stats  enable row level security;
alter table public.match_goal_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['players','seasons','matches','standings','achievements','questions','answers','match_stats','match_goal_events']
  loop
    execute format('drop policy if exists "public_all_%1$s" on public.%1$s;', t);
    execute format(
      'create policy "public_all_%1$s" on public.%1$s
         for all to anon, authenticated
         using (true) with check (true);', t);
  end loop;
end $$;

-- =====================================================
--  REALTIME  (so every open browser updates live)
-- =====================================================
do $$
begin
  alter publication supabase_realtime add table public.matches;
  exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.seasons;
  exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.players;
  exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.standings;
  exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.match_stats;
  exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.match_goal_events;
  exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.questions;
  exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.answers;
  exception when duplicate_object then null;
end $$;

-- =====================================================
--  SEED — one active season to start with
-- =====================================================
insert into public.seasons (name, active) values ('Season 1', true);

-- =====================================================
--  SEED — pre-created accounts (password: 2003)
--  Each friend can log in straight away with their name + 2003.
-- =====================================================
insert into public.players (name, password) values
  ('Wael',        'waelyasyn02003'),
  ('Omar',        '2003'),
  ('Abdul Rahim', '2003'),
  ('Mohammad',    '2003'),
  ('Mustafa',     '2003'),
  ('Abdul Qader', '2003')
on conflict (name) do update set password = excluded.password;

-- Done. Your tables are ready.
