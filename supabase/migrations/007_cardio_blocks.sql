-- ============================================================================
-- Migration: cardio *within* a strength workout (warmup/cooldown on a
-- treadmill/bike/elliptical, or a standalone cardio finisher) -- distinct
-- from a whole endurance-type workout, which already exists via
-- endurance_details. Multiple cardio_blocks rows per workout, ordered.
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

create table public.cardio_blocks (
  id                uuid primary key default gen_random_uuid(),
  workout_id        uuid not null references public.workouts(id) on delete cascade,
  activity          text not null check (activity in ('run', 'walk', 'bike', 'elliptical')),
  purpose           text not null default 'standalone' check (purpose in ('warmup', 'cooldown', 'standalone')),
  duration_minutes  integer check (duration_minutes >= 0),
  incline_percent   numeric(4,1) check (incline_percent >= 0),
  speed_kmh         numeric(4,1) check (speed_kmh >= 0),
  block_order       integer not null default 0
);

create index cardio_blocks_workout_idx on public.cardio_blocks (workout_id, block_order);

alter table public.cardio_blocks enable row level security;

-- Ownership/visibility follows the parent workout, same as `sets`.
create policy "cardio_blocks_select_own_or_connected" on public.cardio_blocks
  for select to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and public.is_connected(w.user_id))
  );
create policy "cardio_blocks_insert_own" on public.cardio_blocks
  for insert to authenticated with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
create policy "cardio_blocks_update_own" on public.cardio_blocks
  for update to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
create policy "cardio_blocks_delete_own" on public.cardio_blocks
  for delete to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
