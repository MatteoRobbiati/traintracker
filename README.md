# TrainTrack

A small group workout tracker: shared exercise library with a muscle-map
preview, per-user workout logging, body weight history, and charts comparing
volume/frequency across the group. React + Vite + TypeScript, Supabase for
auth/data/RLS, Recharts for the group view, deployed as a static site to
GitHub Pages.

## Jump in

Use this link to start logging: [https://matteorobbiati.github.io/traintracker/login](https://matteorobbiati.github.io/traintracker/login)

## Setup

1. Create a Supabase project, then run [`supabase/schema.sql`](supabase/schema.sql)
   in its SQL editor (Project → SQL Editor → New query, paste, run). This
   creates all tables, the `handle_new_user` / `touch_last_seen` functions,
   and RLS policies. If your project already had an older version of the
   schema applied, run the files in [`supabase/migrations/`](supabase/migrations)
   in order instead — each is a one-time incremental change.
2. Copy `.env.example` to `.env.local` and fill in your project's URL and
   anon/public key (Project Settings → API).
3. Install dependencies and start the dev server:

   ```sh
   npm install
   npm run dev
   ```

4. By default, Supabase requires email confirmation on signup. For local
   testing you can turn that off under Authentication → Sign In / Providers →
   Email → "Confirm email", or just confirm via the email Supabase sends. The
   built-in email service also caps you at a very low emails/hour rate limit
   (Authentication → Rate Limits) that can't be raised without custom SMTP —
   disabling "Confirm email" avoids hitting it entirely, since signup then
   sends no email at all.

## Project structure

- `supabase/schema.sql` — full DB schema, triggers, and RLS policies.
- `src/constants/muscles.ts` — the 18 canonical muscle ids (kept in sync with
  the SQL CHECK constraints).
- `src/types/database.ts` — hand-written types matching the schema.
- `src/lib/` — Supabase client, and small formatting/volume-calc helpers.
- `src/context/AuthContext.tsx` — session state, sign in/up/out, the
  `touch_last_seen` heartbeat, and the Realtime Presence subscription behind
  "who's online".
- `src/components/MuscleMap.tsx` — the front/back muscle SVG, driven by an
  exercise's `primary_muscles`/`secondary_muscles`; regions are clickable
  when `onMuscleClick` is passed.
- `src/components/ChatPanel.tsx` — persistent chat side panel (not a route —
  mounted once in the shared authenticated layout so it survives navigation).
- `src/hooks/useConnections.ts` — shared connection-request state, used by
  both Profile's member list and the chat panel's online-people popover.
- `src/pages/` — one file per route (see below).

## Routes

| Path | Page |
| --- | --- |
| `/login`, `/signup` | Auth |
| `/` | Dashboard — recent workouts, latest body weight, quick actions |
| `/exercises`, `/exercises/new`, `/exercises/:id`, `/exercises/:id/edit` | Shared exercise library |
| `/workouts`, `/workouts/new`, `/workouts/:id`, `/workouts/:id/edit` | Personal workout log + history |
| `/group` | Recharts: weekly volume, workout frequency, muscle distribution, per-exercise comparison, group records |
| `/profile` | Body weight log; links to `/connections` |
| `/connections` | Group member list, "last seen", and connection requests (was folded into Profile, split out for room to grow) |

Bodyweight-exercise volume is computed as `(latest body weight + added weight) × reps`;
loaded exercises are `weight × reps`. Added weight may be negative for
assisted movements.

Workouts are one of two types, chosen at creation and fixed after:
**strength** (exercises → sets, as above) or **endurance** — climbing,
running, swimming, cycling, tennis, or a custom sport, with duration,
distance, and free-text session detail (`src/constants/sports.ts`; DB row in
`endurance_details`). Endurance sessions don't produce `sets`, so they don't
appear in Group's volume/exercise charts — that's the expected scope, not a
bug.

Chat is split into topic rooms (`src/constants/rooms.ts`: General, Gym,
Climbing, Bodyweight, Running) — a fixed list for now, not user-creatable.
Adding a room is a pure frontend change (no DB migration): `room` on
`messages` isn't CHECK-constrained.

Dashboard shows a training **streak** (`src/lib/streak.ts`) — deliberately
not the Duolingo kind: one rest day never breaks it, only a *second*
consecutive untrained day does (train → rest → train keeps counting; train →
rest → rest doesn't). Computed client-side from workout dates, no schema for
it. The day-number math goes through `Date.UTC` on parsed Y/M/D components on
both sides (today and each logged date) rather than mixing a parsed-as-local
date string against a raw `Date.now()` instant — the latter is off by one in
any UTC+ timezone once local midnight rounds into the previous UTC day.

Both WorkoutForm (while building a new/edited workout) and WorkoutDetail
(for one already logged) can save the current fields as a named, private
**template** (`src/lib/templates.ts`) to reuse later. WorkoutDetail also
lets the owner edit a logged strength workout's weight/reps/rest values
inline, without leaving the page — the full `/edit` form is still there for
structural changes (adding/removing whole exercises).

"Personal best" (`src/lib/personalBest.ts`) is the heaviest weight logged
for a loaded exercise, or the most reps for a bodyweight one (added weight
as tiebreaker either way) — shown per exercise on its detail page (your own
data) and as a **Group records** table on the Group page (best among
everyone whose data you can see, i.e. self + accepted connections).

From the "Log a workout" form, the current fields can be saved as a named
**template** (`workout_templates` + `template_sets`, mirroring
`workouts`/`endurance_details`/`sets`) and later loaded back in as a
starting point for a new workout. Templates are strictly private — not
shared with connections the way everything else is; every RLS policy on
those two tables checks `user_id = auth.uid()` directly, no
`is_connected()`.

## Access model

Names, "last seen", and the exercise library are visible to everyone with an
account — anyone with the deployed link can sign up (there's no invite/approval
gate on signup itself). Personal training data (workouts, sets, body weight)
is private until two people connect: either can send a request from
**Profile**, the other must accept or reject it from the same page, and
either side can remove an existing connection at any time. The group chat and
online-presence banner are the one exception — they're a single shared room
visible to everyone with an account, not gated by connections.

## Deploying to GitHub Pages

`vite.config.ts` sets `base: "/traintracker/"` — update that first if your repo
has a different name, and also update `pathSegmentsToKeep` in
[`public/404.html`](public/404.html) (see next paragraph) to match how many
path segments that new base has.

GitHub Pages has no server-side routing, so refreshing (or opening a shared
link to) any deep route — `/traintracker/workouts/123` — 404s at the actual
HTTP level; there's no server to fall back to `index.html` the way `vite dev`
or a real host would. `public/404.html` + the inline script in `index.html`
are the standard workaround
([rafgraph/spa-github-pages](https://github.com/rafgraph/spa-github-pages)):
GitHub serves `404.html` for the unmatched path, which redirects to the real
`index.html` with the intended path encoded in the query string; `index.html`
decodes it back via `history.replaceState` before React Router ever reads
the URL. Don't remove either half on its own.

```sh
git remote add origin git@github.com:<you>/traintracker.git
git push -u origin main

npm run deploy   # builds and pushes dist/ to the gh-pages branch
```

Then enable Pages for the repo (Settings → Pages → Deploy from a branch →
`gh-pages`). `npm run deploy` (builds + pushes `dist/` to `gh-pages`) still
works for a one-off manual deploy — `.env.local` is read directly at build
time for that — but see below for deploying automatically instead.
`gh-pages` itself isn't covered by the branch protection below — that
guards `main` (source), not the build output.

## Auto-deploy on merge

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and
publishes to `gh-pages` on every push to `main` — in practice, every merged
PR, since `main` is protected. One-time setup: the workflow needs the same
two values `.env.local` has, as **repo secrets** (CI has no `.env.local`):

1. Repo → **Settings → Secrets and variables → Actions → New repository
   secret**.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase → Project
   Settings → API — same values as `.env.local`).

After that, merging a PR into `main` deploys it within a minute or two, no
manual `npm run deploy` needed — check progress under the repo's **Actions**
tab. `workflow_dispatch` is enabled too, so you can also trigger a redeploy
by hand from that tab without a new commit (e.g. after rotating the Supabase
keys).

## Protecting `main`

[`.github/CODEOWNERS`](.github/CODEOWNERS) makes every file owned by
`@MatteoRobbiati`, but a CODEOWNERS file by itself doesn't block anything —
it only takes effect once a branch protection rule asks for it. One-time
setup, on GitHub:

1. Repo → **Settings → Rules → Rulesets** (or **Settings → Branches** on
   older UIs) → **New branch ruleset** (or **Add branch protection rule**).
2. Target branch: `main`.
3. Enable **Require a pull request before merging**, then under it:
   - **Required approvals**: 1
   - **Require review from Code Owners**
4. Save.

After that, `git push` straight to `main` is rejected for everyone (including
the owner, unless "bypass" is explicitly granted) — changes need a branch +
pull request, approved before merging:

```sh
git checkout -b some-change
# ...edit, commit...
git push -u origin some-change
# open the PR on GitHub (or `gh pr create` if you have the CLI), then
# approve and merge it from there
```
