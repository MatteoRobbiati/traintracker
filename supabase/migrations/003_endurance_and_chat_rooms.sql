-- ============================================================================
-- Migration: endurance workouts (climbing, running, swimming, cycling,
-- tennis, ...) as a second workout type, and topic rooms for chat.
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

alter table public.workouts
  add column workout_type text not null default 'strength'
    check (workout_type in ('strength', 'endurance'));

-- sport/discipline are free text rather than a CHECK-constrained list so new
-- sports don't need a migration; the frontend offers a curated set of
-- presets plus "other".
create table public.endurance_details (
  workout_id      uuid primary key references public.workouts(id) on delete cascade,
  sport           text not null,
  discipline      text,              -- e.g. climbing: 'boulder' | 'rope' | 'both'
  distance_km     numeric(6,2) check (distance_km >= 0),
  session_detail  text               -- free text: routes/boulders sent, splits, etc.
);

alter table public.endurance_details enable row level security;

create policy "endurance_select_own_or_connected" on public.endurance_details
  for select to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and public.is_connected(w.user_id))
  );
create policy "endurance_insert_own" on public.endurance_details
  for insert to authenticated with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
create policy "endurance_update_own" on public.endurance_details
  for update to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
create policy "endurance_delete_own" on public.endurance_details
  for delete to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );

-- Chat topic rooms: `room` isn't a CHECK-constrained list -- the frontend's
-- ROOMS constant is the source of truth, so adding a room later is a pure
-- frontend change, no migration needed.
alter table public.messages add column room text not null default 'general';
create index messages_room_created_at_idx on public.messages (room, created_at);
