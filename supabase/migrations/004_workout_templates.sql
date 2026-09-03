-- ============================================================================
-- Migration: reusable workout templates, strictly private per user (not
-- shared with the group, unlike everything else in this schema).
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

create table public.workout_templates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  workout_type      text not null default 'strength' check (workout_type in ('strength', 'endurance')),
  warmup            text,
  notes             text,
  duration_minutes  integer check (duration_minutes >= 0),
  sport             text,
  discipline        text,
  distance_km       numeric(6,2) check (distance_km >= 0),
  session_detail    text,
  created_at        timestamptz not null default now()
);

create index workout_templates_user_idx on public.workout_templates (user_id, created_at desc);

create table public.template_sets (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id         uuid not null references public.exercises(id) on delete restrict,
  weight              numeric(6,2) not null default 0,
  reps                integer not null check (reps >= 0),
  rest_time_seconds   integer check (rest_time_seconds >= 0),
  set_order           integer not null default 0
);

create index template_sets_template_idx on public.template_sets (template_id, set_order);

alter table public.workout_templates enable row level security;
alter table public.template_sets     enable row level security;

create policy "templates_select_own" on public.workout_templates
  for select to authenticated using (user_id = auth.uid());
create policy "templates_insert_own" on public.workout_templates
  for insert to authenticated with check (user_id = auth.uid());
create policy "templates_update_own" on public.workout_templates
  for update to authenticated using (user_id = auth.uid());
create policy "templates_delete_own" on public.workout_templates
  for delete to authenticated using (user_id = auth.uid());

create policy "template_sets_select_own" on public.template_sets
  for select to authenticated using (
    exists (select 1 from public.workout_templates t where t.id = template_id and t.user_id = auth.uid())
  );
create policy "template_sets_insert_own" on public.template_sets
  for insert to authenticated with check (
    exists (select 1 from public.workout_templates t where t.id = template_id and t.user_id = auth.uid())
  );
create policy "template_sets_update_own" on public.template_sets
  for update to authenticated using (
    exists (select 1 from public.workout_templates t where t.id = template_id and t.user_id = auth.uid())
  );
create policy "template_sets_delete_own" on public.template_sets
  for delete to authenticated using (
    exists (select 1 from public.workout_templates t where t.id = template_id and t.user_id = auth.uid())
  );
