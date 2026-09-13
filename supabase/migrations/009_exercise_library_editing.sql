-- ============================================================================
-- Migration: bodyweight_percent on exercises, and opening exercise edits to
-- everyone (it's a shared community library, not personal data).
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

alter table public.exercises
  add column bodyweight_percent numeric(5,2) not null default 100
    check (bodyweight_percent > 0 and bodyweight_percent <= 100);

comment on column public.exercises.bodyweight_percent is
  'Only meaningful when is_bodyweight is true: what fraction of body weight this specific movement actually loads (pull-ups ~100, a back extension more like 65) -- see src/lib/format.ts effectiveWeight().';

-- Was creator-only; exercises are a shared reference list everyone already
-- sees and contributes to (exercises_insert_any), so editing one (fixing a
-- typo, adding missing muscles, tuning bodyweight_percent) shouldn't be
-- gated on who happened to add it first. Deleting stays creator-only.
drop policy "exercises_update_own" on public.exercises;
create policy "exercises_update_any" on public.exercises
  for update to authenticated using (true);
