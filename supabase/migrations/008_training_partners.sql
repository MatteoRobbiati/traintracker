-- ============================================================================
-- Migration: training partners -- log a workout for yourself and, in the
-- same submit, an auto-created copy for one or more connected friends you
-- trained with (same exercises/sets/reps/cardio; each partner's strength
-- sets use their own typical weight per exercise, falling back to yours
-- where they have no history). See the "Training with" picker in
-- src/pages/WorkoutForm.tsx.
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

alter table public.workouts
  add column logged_by_id     uuid references public.profiles(id) on delete set null default auth.uid(),
  add column session_group_id uuid;

comment on column public.workouts.logged_by_id is
  'Who actually submitted this row -- equal to user_id for a normal self-logged workout, or the training partner who logged it on your behalf via "Training with" in WorkoutForm.';
comment on column public.workouts.session_group_id is
  'Shared by every workout created together in one "Training with" submit (yours + each tagged partner''s), so they can be found and cross-linked. Null for a solo workout.';

create index workouts_session_group_idx on public.workouts (session_group_id) where session_group_id is not null;

-- A workout can now be inserted for someone else's user_id, as long as the
-- inserting user is the recorded logger and is connected to that person --
-- the same trust boundary connections already grant for read access.
drop policy "workouts_insert_own" on public.workouts;
create policy "workouts_insert_own_or_for_connected" on public.workouts
  for insert to authenticated with check (
    logged_by_id = auth.uid() and public.is_connected(user_id)
  );

-- sets/cardio_blocks/endurance_details: whoever created the parent workout
-- row (its owner, or the training partner who logged it for them) may
-- insert its rows.
drop policy "sets_insert_own" on public.sets;
create policy "sets_insert_own_or_for_connected" on public.sets
  for insert to authenticated with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and (w.user_id = auth.uid() or w.logged_by_id = auth.uid())
    )
  );

drop policy "cardio_blocks_insert_own" on public.cardio_blocks;
create policy "cardio_blocks_insert_own_or_for_connected" on public.cardio_blocks
  for insert to authenticated with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and (w.user_id = auth.uid() or w.logged_by_id = auth.uid())
    )
  );

drop policy "endurance_insert_own" on public.endurance_details;
create policy "endurance_insert_own_or_for_connected" on public.endurance_details
  for insert to authenticated with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and (w.user_id = auth.uid() or w.logged_by_id = auth.uid())
    )
  );

-- Update/delete stay owner-only (unchanged) -- once logged, the workout is
-- the partner's own data to edit or remove, same as anything they logged
-- themselves.
