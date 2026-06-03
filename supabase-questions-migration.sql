-- =====================================================
--  LEAGUE Q&A — run once in Supabase SQL Editor
--  (Does NOT delete your existing data)
-- =====================================================

create table if not exists public.questions (
  id                 uuid primary key default gen_random_uuid(),
  author             text not null,
  body               text not null,
  closed             boolean not null default false,
  correct_answer_id  uuid,
  created_at         timestamptz not null default now(),
  timestamp          bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table if not exists public.answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions(id) on delete cascade,
  author       text not null,
  body         text not null,
  created_at   timestamptz not null default now(),
  timestamp    bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists answers_question_idx on public.answers(question_id);

alter table public.questions enable row level security;
alter table public.answers enable row level security;

drop policy if exists "public_all_questions" on public.questions;
create policy "public_all_questions" on public.questions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "public_all_answers" on public.answers;
create policy "public_all_answers" on public.answers
  for all to anon, authenticated using (true) with check (true);

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
