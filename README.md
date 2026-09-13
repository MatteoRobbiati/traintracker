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
| `/group` | Highlights, combined activity calendar, weekly volume, workout frequency, muscle heat, per-exercise comparison |
| `/profile` | Own activity calendar, appearance settings, body weight log + trend |
| `/profile/:userId` | Read-only: a connection's name + activity calendar, in *their* accent color |
| `/connections` | Group member list, "last seen", and connection requests (was folded into Profile, split out for room to grow) |

An exercise has one **equipment** kind, picked in ExerciseForm and mutually
exclusive by a DB CHECK constraint (`exercise_equipment_exclusive`) — each
changes how logged `weight` relates to what's actually moved
(`src/lib/format.ts effectiveWeight()`/`setVolume()`):
- **Standard** (default) — logged weight is the full working weight, as-is.
- **Bodyweight** — logged weight is *added* on top of body weight (can be
  negative for assisted movements).
- **Dumbbell** — logged weight is per dumbbell; the total/volume doubles it.
- **Barbell** — logged weight is what's *added*; the exercise also carries
  its own bar weight (kg, editable, default 20), added on top.

Everywhere a set/PB/volume shows up (WorkoutForm, WorkoutDetail, Group,
ExerciseDetail) says so explicitly — a chip on the exercise ("🏋️ Barbell —
+20 kg bar", "🏋️ Dumbbell — ×2 for volume") and a relabeled weight column
header ("Weight (added to bar)", "Weight (per dumbbell)") — rather than
silently changing what a plain "weight" number means.

Workouts are one of two types, chosen at creation and fixed after:
**strength** (exercises → sets, as above) or **endurance** — climbing,
running, swimming, cycling, tennis, or a custom sport, with duration,
distance, and free-text session detail (`src/constants/sports.ts`; DB row in
`endurance_details`). Endurance sessions don't produce `sets`, so they don't
appear in Group's volume/exercise charts — that's the expected scope, not a
bug.

A **strength** workout can also carry one or more **cardio blocks**
(`src/constants/cardio.ts`, DB table `cardio_blocks`) — run/walk/bike/
elliptical with duration/incline/speed, tagged warmup/cooldown/standalone.
This is deliberately separate from picking "Endurance" as the whole
workout's type: it's for the 10-minute treadmill warmup before a lifting
session, not a session that's cardio end to end. Ownership/visibility
follows the parent workout, same RLS pattern as `sets`.

Chat is split into topic rooms (`src/constants/rooms.ts`: General, Gym,
Climbing, Bodyweight, Running) — a fixed list for now, not user-creatable.
Adding a room is a pure frontend change (no DB migration): `room` on
`messages` isn't CHECK-constrained. The room-tab row (`.chat-panel-rooms`)
wraps onto a second line (`flex-wrap`) instead of scrolling horizontally —
with only a handful of rooms, showing all of them at once beats hiding some
behind a scroll a thumb has to discover first. Each tab is a real bordered
chip (`.chat-room-tab`) even when inactive, not plain text, so it reads as
an obviously selectable option.

Sending a message appends it locally from the insert's own returned row
(`.select().single()`), rather than waiting on the realtime
`postgres_changes` subscription to echo it back — that round-trip could lag
or drop, which read as "I click send and nothing happens until I refresh."
The subscription still delivers everyone *else's* messages the same as
before; a dedupe-by-`id` check covers it also echoing our own insert back.

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

A new (not-yet-submitted) workout **autosaves as a draft**
(`src/lib/workoutDraft.ts`, `localStorage`) on every change — switching to
another section of the app, or just closing the tab, doesn't lose what's
been typed in. Reopening "Log a workout" silently restores it (a small
banner + "Discard draft" button is the only sign it happened), and Dashboard
surfaces a "📝 Workout in progress" card linking back to it so you don't
have to remember it exists. The draft clears itself once the workout is
actually submitted, or on explicit discard. Editing an *existing* logged
workout doesn't touch this at all — that's already backed by the database,
there's nothing to lose.

Personal bests come in two independent flavors (`src/lib/personalBest.ts`),
both shown per exercise on its detail page:
- **Massimale** (`isBetterSet`) — the heaviest weight logged for a loaded
  exercise, or the most reps for a bodyweight one (added weight as
  tiebreaker either way). One best *set*.
- **Best session volume** (`bestVolumeSession`) — sets for that exercise
  are grouped by workout and summed; the highest-total session wins. A
  session of many lighter sets can out-volume a single heavy set, so it's
  tracked as its own record instead of being invisible next to the
  massimale.

Group used to also show these as two big "Group records" tables (best
among everyone whose data you can see) — removed for being the single
most-crowded thing on the page; the "💪 Latest PB" highlight card covers
the at-a-glance case, and ExerciseDetail still has the full detail
per-exercise.

The Group page opens with a **Highlights** panel (most active this week,
longest current streak in the group, combined volume this week, most recent
new massimale) followed by a combined **activity calendar** (everyone's
workouts summed into one `ContributionGraph`, in the viewer's own accent —
it's a group aggregate, not any one person's), then the detailed
charts/tables below — meant to answer "what's been going on" at a glance
instead of making everyone read every chart to find out. The per-person
"Body weight over time" comparison chart that used to live here was
dropped too (declutter, same reasoning) — that's now Profile's job, see
below.

Group's muscle heat map splits an exercise's volume across its
`primary_muscles` **and** `secondary_muscles` (secondary at half weight) —
it used to only look at `primary_muscles`, so a muscle set as secondary on
every exercise that touches it (e.g. glutes on an exercise like leg
extension, mostly a quad movement) never showed up at all, not even dimly.

Each exercise block in WorkoutForm has a rest **timer**: "Start rest timer"
after finishing a set, "Stop & next set" right before the next one — that
fills the just-finished set's rest field with the elapsed time and adds the
next set row in one action, instead of typing a number in after the fact.

Mobile inputs are 16px (not smaller) on purpose, `table td input`/`select`
included — anything under 16px makes iOS Safari zoom the whole page in on
focus, which is exactly the "why did my phone just jump" annoyance mid-set.
Numeric fields also set `inputMode` (`"decimal"` for weight/distance,
`"numeric"` for reps/rest/duration) so the phone offers the right keyboard.

Adding an exercise to a workout uses `SearchableSelect`
(`src/components/SearchableSelect.tsx`) instead of a native `<select>` —
type to filter instead of scrolling the whole exercise library blind. It's
a generic text-input-plus-filtered-dropdown component, reusable anywhere
else an option list might outgrow a native select.

Appearance (Profile → **Appearance**) is a light/dark/system theme mode
plus an accent color (`src/lib/theme.ts`, `src/context/ThemeContext.tsx`).
"System" tracks the OS setting live. The base paper/ink palette stays
CSS-driven via `data-theme` on `<html>` (already there for dark mode — this
just added the UI to force it); the accent's
`--ember`/`--ember-muted`/`--focus` are written directly as inline CSS
variables rather than a `data-accent` × `data-theme` CSS matrix, so a new
accent is one object entry, not several new rule blocks. `index.html`
carries a plain-JS duplicate of the palette table in a pre-React init
script, applied from `localStorage` before first paint so there's no flash
— keep the two in sync if a palette value changes.

The preference itself is synced to the account (`profiles.theme_mode` /
`profiles.accent`, migration
[`005_profile_theme.sql`](supabase/migrations/005_profile_theme.sql)), not
just the device: `ThemeProvider` (nested inside `AuthProvider` so it can
read the logged-in profile) pulls the account's saved value in once per
login and writes back to `profiles` on every change, with `localStorage`
kept only as the pre-login/pre-profile-load fallback (and if a write ever
fails). Before this, an accent picked in a private-browsing window or on a
different device simply didn't carry over — that was `localStorage` working
as designed, just not what "save my color" implied once there's an account
already synced across everything else.

Profile also carries its own **activity calendar** (same `ContributionGraph`
as Dashboard, own workout dates) above Appearance, and a small weight-trend
`Recharts` line above the existing body-weight table once there are at
least two entries. `/profile/:userId` renders the read-only counterpart for
a connection: their name and *their* activity calendar in *their* chosen
accent (`src/lib/theme.ts accentColors()`, `ContributionGraph`'s
`colorOverride` prop writes `--ember`/`--ember-muted` inline for just that
instance rather than touching the page's own theme) — nothing else from
their Profile (appearance settings, weight log) is shown, and RLS still
gates the actual workout dates on connection status, so an unconnected
profile just reads as "no activity to show" rather than an error.
Connections links each accepted row's name to this route.

From the "Log a workout" form, the current fields can be saved as a named
**template** (`workout_templates` + `template_sets`, mirroring
`workouts`/`endurance_details`/`sets`) and later loaded back in as a
starting point for a new workout. Templates are strictly private — not
shared with connections the way everything else is; every RLS policy on
those two tables checks `user_id = auth.uid()` directly, no
`is_connected()`.

Dashboard shows an **Activity** panel (`src/components/ContributionGraph.tsx`) —
a GitHub-contributions-style calendar of workout density, one square per day
over the last year, scrolled to today by default. It's deliberately just a
density map, independent from the streak text next to it: a rest day renders
as an empty square without implying the streak broke, matching how
`computeStreak` (`src/lib/streak.ts`) already tolerates one rest day. Each
level is `color-mix()`ed against `--stone` (the empty cell's own base color)
rather than the pastel `--ember-muted` tint, so even the lightest "trained"
level reads as a clear, saturated step up instead of a wash.

Friends/connections has its own top-level nav entry (`/connections`, both the
top nav and the mobile bottom bar) rather than living inside Profile — the
pending-request count badge moved there with it.

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
