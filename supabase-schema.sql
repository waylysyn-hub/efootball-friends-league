-- =====================================================
-- eFOOTBALL FRIENDS LEAGUE — FRESH SUPABASE SCHEMA
-- WARNING: recreates league tables and wipes league data.
-- Existing projects should use the migration files instead.
-- =====================================================

-- ---------- Clean start ----------
drop table if exists public.player_accounts cascade;
drop table if exists public.match_goal_events cascade;
drop table if exists public.match_stats cascade;
drop table if exists public.answers cascade;
drop table if exists public.questions cascade;
drop table if exists public.achievements cascade;
drop table if exists public.standings cascade;
drop table if exists public.matches cascade;
drop table if exists public.seasons cascade;
drop table if exists public.players cascade;

-- ---------- PLAYER PROFILES ----------
-- Credentials never live here. Supabase Auth owns passwords.
create table public.players (
  name    text primary key,
  role    text not null default 'player' check (role in ('admin', 'player')),
  created bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- Auth link table. RLS later ensures users can only see their own mapping row.
create table public.player_accounts (
  name         text primary key references public.players(name) on update cascade on delete cascade,
  auth_user_id uuid not null unique
);

-- ---------- SEASONS ----------
create table public.seasons (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  active  boolean not null default false,
  created bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ---------- MATCHES ----------
create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  player1    text not null references public.players(name) on update cascade,
  player2    text not null references public.players(name) on update cascade,
  goals1     integer not null check (goals1 >= 0),
  goals2     integer not null check (goals2 >= 0),
  date       date not null,
  season_id  uuid references public.seasons(id) on delete cascade,
  timestamp  bigint not null default (extract(epoch from now()) * 1000)::bigint,
  created_at timestamptz not null default now(),
  check (player1 <> player2)
);
create index matches_season_idx on public.matches(season_id);
create index matches_players_idx on public.matches(player1, player2);

-- ---------- MATCH PLAYER STATS ----------
create table public.match_stats (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references public.matches(id) on delete cascade,
  player         text not null references public.players(name) on update cascade,
  character_name text not null default '',
  goals          integer not null default 0 check (goals >= 0),
  assists        integer not null default 0 check (assists >= 0),
  unique (match_id, player)
);
create index match_stats_match_idx on public.match_stats(match_id);

-- ---------- GOAL EVENTS ----------
create table public.match_goal_events (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  owner      text not null references public.players(name) on update cascade,
  scorer     text not null,
  assist     text not null default '',
  minute     integer not null default 0 check (minute between 0 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index match_goal_events_match_idx on public.match_goal_events(match_id);

-- ---------- STANDINGS SNAPSHOT ----------
create table public.standings (
  season        text not null,
  player        text not null references public.players(name) on update cascade on delete cascade,
  played        integer not null default 0,
  wins          integer not null default 0,
  draws          integer not null default 0,
  losses        integer not null default 0,
  goals_for     integer not null default 0,
  goals_against integer not null default 0,
  goal_diff     integer not null default 0,
  points        integer not null default 0,
  rank          integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (season, player)
);

-- ---------- LEAGUE Q&A ----------
create table public.questions (
  id                uuid primary key default gen_random_uuid(),
  author            text not null references public.players(name) on update cascade,
  body              text not null check (char_length(trim(body)) between 1 and 2000),
  closed            boolean not null default false,
  correct_answer_id uuid,
  created_at        timestamptz not null default now(),
  timestamp         bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table public.answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author      text not null references public.players(name) on update cascade,
  body        text not null check (char_length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  timestamp   bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index answers_question_idx on public.answers(question_id);

alter table public.questions
  add constraint questions_correct_answer_fk
  foreign key (correct_answer_id) references public.answers(id) on delete set null;

-- ---------- ACHIEVEMENTS ----------
create table public.achievements (
  player         text not null references public.players(name) on update cascade on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  primary key (player, achievement_id)
);

-- ---------- RLS IMMEDIATELY ON ----------
alter table public.players enable row level security;
alter table public.player_accounts enable row level security;
alter table public.seasons enable row level security;
alter table public.matches enable row level security;
alter table public.standings enable row level security;
alter table public.achievements enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.match_stats enable row level security;
alter table public.match_goal_events enable row level security;

-- Fresh schema starts read-only from the browser. Fine-grained writes are installed
-- by supabase-security-migration.sql.
revoke all on table public.players, public.player_accounts, public.seasons, public.matches,
  public.standings, public.achievements, public.questions, public.answers,
  public.match_stats, public.match_goal_events from anon, authenticated;

grant select(name, role, created) on public.players to anon, authenticated;
grant select on public.seasons, public.matches, public.standings, public.achievements,
  public.questions, public.answers, public.match_stats, public.match_goal_events to anon;
grant select on public.seasons, public.matches, public.standings, public.achievements,
  public.questions, public.answers, public.match_stats, public.match_goal_events to authenticated;
grant select(name) on public.player_accounts to authenticated;

create policy players_public_read on public.players for select to anon using (true);
create policy players_auth_read on public.players for select to authenticated using (true);
create policy player_accounts_read_self on public.player_accounts for select to authenticated
  using (auth_user_id = (select auth.uid()));
create policy seasons_public_read on public.seasons for select to anon using (true);
create policy seasons_auth_read on public.seasons for select to authenticated using (true);
create policy matches_public_read on public.matches for select to anon using (true);
create policy matches_auth_read on public.matches for select to authenticated using (true);
create policy standings_public_read on public.standings for select to anon using (true);
create policy standings_auth_read on public.standings for select to authenticated using (true);
create policy achievements_public_read on public.achievements for select to anon using (true);
create policy achievements_auth_read on public.achievements for select to authenticated using (true);
create policy questions_public_read on public.questions for select to anon using (true);
create policy questions_auth_read on public.questions for select to authenticated using (true);
create policy answers_public_read on public.answers for select to anon using (true);
create policy answers_auth_read on public.answers for select to authenticated using (true);
create policy match_stats_public_read on public.match_stats for select to anon using (true);
create policy match_stats_auth_read on public.match_stats for select to authenticated using (true);
create policy goal_events_public_read on public.match_goal_events for select to anon using (true);
create policy goal_events_auth_read on public.match_goal_events for select to authenticated using (true);

-- ---------- REALTIME ----------
do $$
declare t text;
begin
  foreach t in array array['matches','seasons','players','standings','match_stats','match_goal_events','questions','answers'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- INITIAL ROSTER ----------
insert into public.players (name, role) values
  ('Wael', 'admin'),
  ('Omar', 'player'),
  ('Abdul Rahim', 'player'),
  ('Mohammad', 'player'),
  ('Mustafa', 'player'),
  ('Abdul Qader', 'player')
on conflict (name) do nothing;

insert into public.seasons (name, active) values ('Season 1', true);

-- Next:
-- 1) Run supabase-groups-chat-migration.sql.
-- 2) Run supabase-security-migration.sql.
-- 3) Create the first Auth user in Supabase Dashboard and insert its id into
--    public.player_accounts for the matching player name.
