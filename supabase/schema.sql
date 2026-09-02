-- ============================================================================
-- Gym Tracker — database schema
-- Target: Supabase Postgres. Run this in the SQL editor of a fresh project
-- (or split it into supabase/migrations/*.sql once you wire up the CLI).
-- ============================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Canonical muscle ids. Shared 1:1 with src/constants/muscles.ts on the
-- frontend — the same strings drive the SVG region ids, so the map needs no
-- lookup table. Keep the two lists in sync if you add a muscle.
-- ----------------------------------------------------------------------------
-- neck, traps, front_delts, rear_delts, chest, abs, obliques, biceps,
-- triceps, forearms, lats, upper_back, lower_back, glutes, quads,
-- hamstrings, adductors, calves

-- ============================================================================
-- profiles — one row per user, created automatically on signup (see trigger
-- below). Current body weight lives in profiles for convenience; the full
-- history lives in body_weight_logs.
-- ============================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

comment on column public.profiles.last_seen is
  'Updated via the touch_last_seen() RPC, called on app load and after key actions.';

-- ============================================================================
-- body_weight_logs — historized body weight. "Current weight" = most recent
-- row per user; used to compute bodyweight-exercise volume at log time.
-- ============================================================================
create table public.body_weight_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  weight_kg    numeric(5,2) not null check (weight_kg > 0),
  recorded_at  timestamptz not null default now()
);

create index body_weight_logs_user_idx on public.body_weight_logs (user_id, recorded_at desc);

-- ============================================================================
-- exercises — shared library. Anyone can add one; everyone sees them all.
-- ============================================================================
create table public.exercises (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  description        text,               -- execution notes / cues / tips
  primary_muscles    text[] not null default '{}',
  secondary_muscles  text[] not null default '{}',
  is_bodyweight      boolean not null default false,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint primary_muscles_valid check (
    primary_muscles <@ array[
      'neck','traps','front_delts','rear_delts','chest','abs','obliques',
      'biceps','triceps','forearms','lats','upper_back','lower_back',
      'glutes','quads','hamstrings','adductors','calves'
    ]::text[]
  ),
  constraint secondary_muscles_valid check (
    secondary_muscles <@ array[
      'neck','traps','front_delts','rear_delts','chest','abs','obliques',
      'biceps','triceps','forearms','lats','upper_back','lower_back',
      'glutes','quads','hamstrings','adductors','calves'
    ]::text[]
  )
);

-- ============================================================================
-- workouts — one session per row.
-- ============================================================================
create table public.workouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  date              date not null default current_date,
  notes             text,
  warmup            text,               -- free-text warmup summary
  duration_minutes  integer check (duration_minutes >= 0),
  created_at        timestamptz not null default now()
);

create index workouts_user_date_idx on public.workouts (user_id, date desc);

-- ============================================================================
-- sets — one row per working set within a workout.
-- weight can be negative for assisted bodyweight movements (e.g. assisted
-- pull-up machine: -20 means 20kg of assistance).
-- ============================================================================
create table public.sets (
  id                  uuid primary key default gen_random_uuid(),
  workout_id          uuid not null references public.workouts(id) on delete cascade,
  exercise_id         uuid not null references public.exercises(id) on delete restrict,
  weight              numeric(6,2) not null default 0,
  reps                integer not null check (reps >= 0),
  rest_time_seconds   integer check (rest_time_seconds >= 0),
  set_order           integer not null default 0
);

create index sets_workout_idx on public.sets (workout_id, set_order);
create index sets_exercise_idx on public.sets (exercise_id);

-- ============================================================================
-- New-user bootstrap: create a profile row the moment someone signs up.
-- ============================================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- touch_last_seen() — called by the frontend on app load / key actions.
-- ============================================================================
create function public.touch_last_seen()
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;

grant execute on function public.touch_last_seen() to authenticated;

-- ============================================================================
-- Row Level Security — everyone in the group reads everything; writes are
-- scoped to the owning user (exercises: scoped to the creator).
-- ============================================================================
alter table public.profiles         enable row level security;
alter table public.body_weight_logs enable row level security;
alter table public.exercises        enable row level security;
alter table public.workouts         enable row level security;
alter table public.sets             enable row level security;

-- profiles
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

-- body_weight_logs
create policy "weight_logs_select_all" on public.body_weight_logs
  for select to authenticated using (true);
create policy "weight_logs_insert_own" on public.body_weight_logs
  for insert to authenticated with check (user_id = auth.uid());
create policy "weight_logs_update_own" on public.body_weight_logs
  for update to authenticated using (user_id = auth.uid());
create policy "weight_logs_delete_own" on public.body_weight_logs
  for delete to authenticated using (user_id = auth.uid());

-- exercises (community library: anyone inserts, only the creator edits/removes)
create policy "exercises_select_all" on public.exercises
  for select to authenticated using (true);
create policy "exercises_insert_any" on public.exercises
  for insert to authenticated with check (created_by = auth.uid());
create policy "exercises_update_own" on public.exercises
  for update to authenticated using (created_by = auth.uid());
create policy "exercises_delete_own" on public.exercises
  for delete to authenticated using (created_by = auth.uid());

-- workouts
create policy "workouts_select_all" on public.workouts
  for select to authenticated using (true);
create policy "workouts_insert_own" on public.workouts
  for insert to authenticated with check (user_id = auth.uid());
create policy "workouts_update_own" on public.workouts
  for update to authenticated using (user_id = auth.uid());
create policy "workouts_delete_own" on public.workouts
  for delete to authenticated using (user_id = auth.uid());

-- sets (ownership follows the parent workout)
create policy "sets_select_all" on public.sets
  for select to authenticated using (true);
create policy "sets_insert_own" on public.sets
  for insert to authenticated with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
create policy "sets_update_own" on public.sets
  for update to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
create policy "sets_delete_own" on public.sets
  for delete to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );
