-- ============================================================================
-- Migration: equipment-aware weight/volume -- dumbbell exercises (weight
-- logged per dumbbell, doubled for volume) and barbell exercises (weight
-- logged is what's added, the bar's own weight is tracked separately and
-- added on top). See src/lib/format.ts effectiveWeight().
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

alter table public.exercises
  add column is_dumbbell   boolean not null default false,
  add column bar_weight_kg numeric(5,2) check (bar_weight_kg >= 0);

-- The three affect weight/volume calculation differently and don't compose
-- -- the form only lets you pick one "equipment" at a time.
alter table public.exercises
  add constraint exercise_equipment_exclusive check (
    (case when is_bodyweight then 1 else 0 end)
    + (case when is_dumbbell then 1 else 0 end)
    + (case when bar_weight_kg is not null then 1 else 0 end) <= 1
  );
