-- =====================================================
--  GROUPS CHAT — Supabase tables
--  Run in: Supabase Dashboard → SQL Editor → New query
-- =====================================================

create table if not exists public.chat_groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  emoji          text not null default '⚽',
  description    text not null default '',
  palette_index  integer not null default 0 check (palette_index >= 0 and palette_index < 12),
  created_by     text not null references public.players(name) on delete cascade,
  created_at     timestamptz not null default now()
);

create table if not exists public.chat_group_members (
  group_id   uuid not null references public.chat_groups(id) on delete cascade,
  player     text not null references public.players(name) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, player)
);

create index if not exists chat_group_members_player_idx on public.chat_group_members(player);

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.chat_groups(id) on delete cascade,
  author     text not null references public.players(name) on delete cascade,
  body       text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_group_idx on public.chat_messages(group_id, created_at);

create table if not exists public.chat_invitations (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.chat_groups(id) on delete cascade,
  invited_player  text not null references public.players(name) on delete cascade,
  invited_by      text not null references public.players(name) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'rejected')),
  created_at      timestamptz not null default now(),
  unique (group_id, invited_player)
);

create index if not exists chat_invitations_player_idx on public.chat_invitations(invited_player, status);

-- RLS (same open policy as the league app)
alter table public.chat_groups         enable row level security;
alter table public.chat_group_members  enable row level security;
alter table public.chat_messages       enable row level security;
alter table public.chat_invitations    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['chat_groups','chat_group_members','chat_messages','chat_invitations']
  loop
    execute format('drop policy if exists "public_all_%1$s" on public.%1$s;', t);
    execute format(
      'create policy "public_all_%1$s" on public.%1$s
         for all to anon, authenticated
         using (true) with check (true);', t);
  end loop;
end $$;

-- Realtime
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.chat_invitations;
  exception when duplicate_object then null;
end $$;
