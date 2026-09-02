-- ============================================================================
-- Migration: group chat (single room, everyone reads/writes own messages).
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 2000),
  created_at  timestamptz not null default now()
);

create index messages_created_at_idx on public.messages (created_at);

alter publication supabase_realtime add table public.messages;

alter table public.messages enable row level security;

create policy "messages_select_all" on public.messages
  for select to authenticated using (true);
create policy "messages_insert_own" on public.messages
  for insert to authenticated with check (sender_id = auth.uid());
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (sender_id = auth.uid());

-- "Who's online" is not a table — it's handled client-side via Supabase
-- Realtime Presence, which needs no schema at all.
