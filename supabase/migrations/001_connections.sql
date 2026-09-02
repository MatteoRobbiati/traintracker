-- ============================================================================
-- Migration: connection-gated visibility for personal training data.
-- Run this once in the SQL Editor of an existing project that already has
-- schema.sql applied. A fresh project can just run the updated schema.sql
-- instead — this file exists only to bring an existing DB up to date.
-- ============================================================================

create table public.connections (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  addressee_id  uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,

  constraint connections_not_self check (requester_id <> addressee_id),
  constraint connections_unique_pair unique (requester_id, addressee_id)
);

create index connections_addressee_idx on public.connections (addressee_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

create function public.is_connected(target_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select target_id = auth.uid()
    or exists (
      select 1 from public.connections
      where status = 'accepted'
        and ((requester_id = auth.uid() and addressee_id = target_id)
          or (addressee_id = auth.uid() and requester_id = target_id))
    );
$$;

grant execute on function public.is_connected(uuid) to authenticated;

alter table public.connections enable row level security;

create policy "connections_select_participant" on public.connections
  for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "connections_insert_own" on public.connections
  for insert to authenticated with check (requester_id = auth.uid());
create policy "connections_update_addressee" on public.connections
  for update to authenticated using (addressee_id = auth.uid());
create policy "connections_delete_participant" on public.connections
  for delete to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Swap the old "everyone sees everything" policies for connection-gated ones.
drop policy "weight_logs_select_all" on public.body_weight_logs;
create policy "weight_logs_select_own_or_connected" on public.body_weight_logs
  for select to authenticated using (public.is_connected(user_id));

drop policy "workouts_select_all" on public.workouts;
create policy "workouts_select_own_or_connected" on public.workouts
  for select to authenticated using (public.is_connected(user_id));

drop policy "sets_select_all" on public.sets;
create policy "sets_select_own_or_connected" on public.sets
  for select to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and public.is_connected(w.user_id))
  );

-- profiles and exercises are unchanged: names/last_seen and the shared
-- exercise library stay visible to everyone.
