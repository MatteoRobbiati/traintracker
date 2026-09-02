# Gym Tracker

A small group workout tracker: shared exercise library with a muscle-map
preview, per-user workout logging, body weight history, and charts comparing
volume/frequency across the group. React + Vite + TypeScript, Supabase for
auth/data/RLS, Recharts for the group view, deployed as a static site to
GitHub Pages.

## Setup

1. Create a Supabase project, then run [`supabase/schema.sql`](supabase/schema.sql)
   in its SQL editor (Project → SQL Editor → New query, paste, run). This
   creates all tables, the `handle_new_user` / `touch_last_seen` functions,
   and RLS policies.
2. Copy `.env.example` to `.env.local` and fill in your project's URL and
   anon/public key (Project Settings → API).
3. Install dependencies and start the dev server:

   ```sh
   npm install
   npm run dev
   ```

4. By default, Supabase requires email confirmation on signup. For local
   testing you can turn that off under Authentication → Providers → Email →
   "Confirm email", or just confirm via the email Supabase sends.

## Project structure

- `supabase/schema.sql` — full DB schema, triggers, and RLS policies.
- `src/constants/muscles.ts` — the 18 canonical muscle ids (kept in sync with
  the SQL CHECK constraints).
- `src/types/database.ts` — hand-written types matching the schema.
- `src/lib/` — Supabase client, and small formatting/volume-calc helpers.
- `src/context/AuthContext.tsx` — session state, sign in/up/out, and the
  `touch_last_seen` heartbeat.
- `src/components/MuscleMap.tsx` — the front/back muscle SVG, driven by an
  exercise's `primary_muscles`/`secondary_muscles`.
- `src/pages/` — one file per route (see below).

## Routes

| Path | Page |
| --- | --- |
| `/login`, `/signup` | Auth |
| `/` | Dashboard — recent workouts, latest body weight, quick actions |
| `/exercises`, `/exercises/new`, `/exercises/:id`, `/exercises/:id/edit` | Shared exercise library |
| `/workouts`, `/workouts/new`, `/workouts/:id` | Personal workout log + history |
| `/group` | Recharts: weekly volume, workout frequency, muscle distribution, per-exercise comparison |
| `/profile` | Body weight log + group "last seen" list |

Bodyweight-exercise volume is computed as `(latest body weight + added weight) × reps`;
loaded exercises are `weight × reps`. Added weight may be negative for
assisted movements.

## Deploying to GitHub Pages

`vite.config.ts` sets `base: "/gym-tracker/"` — update that first if your repo
has a different name.

```sh
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<you>/gym-tracker.git
git push -u origin main

npm run deploy   # builds and pushes dist/ to the gh-pages branch
```

Then enable Pages for the repo (Settings → Pages → Deploy from a branch →
`gh-pages`). Set the two `VITE_SUPABASE_*` values as repo secrets only if you
move the build into CI — for `npm run deploy` run locally, `.env.local` is
read directly at build time.
