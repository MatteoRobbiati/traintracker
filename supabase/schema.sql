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
  created_at  timestamptz not null default now(),
  theme_mode  text not null default 'system' check (theme_mode in ('system', 'light', 'dark')),
  accent      text not null default 'ember'  check (accent in ('ember', 'ocean', 'forest', 'grape', 'rose'))
);

comment on column public.profiles.last_seen is
  'Updated via the touch_last_seen() RPC, called on app load and after key actions.';
comment on column public.profiles.theme_mode is
  'Appearance preference, synced across devices -- see src/context/ThemeContext.tsx.';
comment on column public.profiles.accent is
  'Accent color id from src/lib/theme.ts ACCENTS -- keep the CHECK list in sync with it.';

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
  is_dumbbell        boolean not null default false,  -- logged weight is per dumbbell; volume/effective weight doubles it
  bar_weight_kg      numeric(5,2) check (bar_weight_kg >= 0), -- barbell exercises: logged weight is what's added, this is the bar itself
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),

  -- The three affect weight/volume calculation differently (see
  -- src/lib/format.ts effectiveWeight()) and don't compose -- the form only
  -- lets you pick one "equipment" at a time.
  constraint exercise_equipment_exclusive check (
    (case when is_bodyweight then 1 else 0 end)
    + (case when is_dumbbell then 1 else 0 end)
    + (case when bar_weight_kg is not null then 1 else 0 end) <= 1
  ),

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
-- workouts — one session per row. workout_type distinguishes a normal
-- strength session (logged via sets, below) from an endurance session
-- (logged via endurance_details, below) — a workout is one or the other,
-- never both.
-- ============================================================================
create table public.workouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  date              date not null default current_date,
  notes             text,
  warmup            text,               -- free-text warmup summary
  duration_minutes  integer check (duration_minutes >= 0),
  workout_type      text not null default 'strength' check (workout_type in ('strength', 'endurance')),
  created_at        timestamptz not null default now()
);

create index workouts_user_date_idx on public.workouts (user_id, date desc);

-- ============================================================================
-- sets — one row per working set within a strength workout.
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
-- endurance_details — one row per endurance workout (climbing, running,
-- swimming, cycling, tennis, ...). sport/discipline are free text rather
-- than a CHECK-constrained list so new sports don't need a migration; the
-- frontend offers a curated set of presets plus "other".
-- ============================================================================
create table public.endurance_details (
  workout_id      uuid primary key references public.workouts(id) on delete cascade,
  sport           text not null,
  discipline      text,              -- e.g. climbing: 'boulder' | 'rope' | 'both'
  distance_km     numeric(6,2) check (distance_km >= 0),
  session_detail  text               -- free text: routes/boulders sent, splits, etc.
);

-- ============================================================================
-- cardio_blocks — cardio *within* a strength workout (warmup/cooldown on a
-- treadmill/bike/elliptical, or just a standalone cardio finisher), distinct
-- from a whole endurance-type workout above. Multiple per workout, ordered.
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

-- ============================================================================
-- workout_templates — reusable session plans, strictly private per user
-- (not shared with the group, unlike everything else in this schema). Same
-- shape as workouts+endurance_details (minus `date`), so a template loads
-- straight into WorkoutForm; template_sets mirrors `sets` the same way
-- endurance columns live inline here rather than a second table, since a
-- template is a single planning row, not a logged session with its own
-- lifecycle.
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
-- connections — access requests between users. Anyone can request to see
-- someone else's personal data (workouts/sets/body weight); the addressee
-- must accept or reject. Once accepted, visibility is mutual. Names and the
-- exercise library stay visible to everyone regardless (see RLS below) —
-- this only gates personal training data.
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

-- is_connected(target_id) — true if the current user IS target_id, or there's
-- an accepted connection between them in either direction. Used by RLS below.
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

-- ============================================================================
-- messages — topic rooms (general/gym/climbing/...), visible to everyone
-- with an account (like the exercise library, not gated by connections).
-- `room` isn't a CHECK-constrained list — the frontend's ROOMS constant is
-- the source of truth, so adding a room is a pure frontend change. "Online
-- now" is handled separately, client-side, via Supabase Realtime Presence
-- (global, not per-room) — it isn't backed by a table.
-- ============================================================================
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  room        text not null default 'general',
  body        text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 2000),
  created_at  timestamptz not null default now()
);

create index messages_room_created_at_idx on public.messages (room, created_at);

-- Stream inserts to subscribed clients in realtime.
alter publication supabase_realtime add table public.messages;

-- ============================================================================
-- Row Level Security — names and the exercise library are visible to
-- everyone; personal training data (workouts/sets/body weight) is visible
-- only to its owner and to users with an accepted connection. Writes are
-- always scoped to the owning user (exercises: scoped to the creator).
-- ============================================================================
alter table public.profiles         enable row level security;
alter table public.body_weight_logs enable row level security;
alter table public.exercises        enable row level security;
alter table public.workouts         enable row level security;
alter table public.sets             enable row level security;
alter table public.connections      enable row level security;
alter table public.messages         enable row level security;
alter table public.endurance_details enable row level security;
alter table public.cardio_blocks    enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_sets     enable row level security;

-- profiles (names + last_seen stay visible to everyone so people can find
-- who to send a connection request to)
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

-- body_weight_logs — gated by connection
create policy "weight_logs_select_own_or_connected" on public.body_weight_logs
  for select to authenticated using (public.is_connected(user_id));
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

-- workouts — gated by connection
create policy "workouts_select_own_or_connected" on public.workouts
  for select to authenticated using (public.is_connected(user_id));
create policy "workouts_insert_own" on public.workouts
  for insert to authenticated with check (user_id = auth.uid());
create policy "workouts_update_own" on public.workouts
  for update to authenticated using (user_id = auth.uid());
create policy "workouts_delete_own" on public.workouts
  for delete to authenticated using (user_id = auth.uid());

-- sets (ownership/visibility follows the parent workout)
create policy "sets_select_own_or_connected" on public.sets
  for select to authenticated using (
    exists (select 1 from public.workouts w where w.id = workout_id and public.is_connected(w.user_id))
  );
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

-- endurance_details (ownership/visibility follows the parent workout, same as sets)
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

-- cardio_blocks (ownership/visibility follows the parent workout, same as sets)
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

-- workout_templates / template_sets — strictly private, not even visible to
-- connections (unlike everything else above): a template is personal
-- planning, not a logged session to compare against the group.
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

-- connections — each side sees only requests they're part of; the requester
-- creates it, only the addressee can accept/reject, either side can remove
-- it (which also allows re-requesting after a rejection).
create policy "connections_select_participant" on public.connections
  for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "connections_insert_own" on public.connections
  for insert to authenticated with check (requester_id = auth.uid());
create policy "connections_update_addressee" on public.connections
  for update to authenticated using (addressee_id = auth.uid());
create policy "connections_delete_participant" on public.connections
  for delete to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

-- messages (topic rooms: everyone reads everything, writes/deletes own)
create policy "messages_select_all" on public.messages
  for select to authenticated using (true);
create policy "messages_insert_own" on public.messages
  for insert to authenticated with check (sender_id = auth.uid());
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (sender_id = auth.uid());
