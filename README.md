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
| `/group` | Recharts: weekly volume, workout frequency, muscle distribution, per-exercise comparison |
| `/profile` | Body weight log, group "last seen" list, and connection requests |

Bodyweight-exercise volume is computed as `(latest body weight + added weight) × reps`;
loaded exercises are `weight × reps`. Added weight may be negative for
assisted movements.

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
has a different name.

```sh
git remote add origin git@github.com:<you>/traintracker.git
git push -u origin main

npm run deploy   # builds and pushes dist/ to the gh-pages branch
```

Then enable Pages for the repo (Settings → Pages → Deploy from a branch →
`gh-pages`). Set the two `VITE_SUPABASE_*` values as repo secrets only if you
move the build into CI — for `npm run deploy` run locally, `.env.local` is
read directly at build time. `npm run deploy` pushes straight to the
`gh-pages` branch regardless of the branch protection below — that's the
build output, not source, and isn't meant to go through review.

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
