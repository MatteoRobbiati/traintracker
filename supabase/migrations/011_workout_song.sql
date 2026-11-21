-- ============================================================================
-- Migration: "best song" of a workout -- the track that carried the session.
-- Every song logged by you and your connections feeds the group playlist on
-- the Group page (src/components/GroupPlaylist.tsx). Visibility follows the
-- workouts row's existing RLS, so no new policies are needed.
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

alter table public.workouts
  add column if not exists song_title  text check (song_title is null or char_length(song_title) <= 200),
  add column if not exists song_artist text check (song_artist is null or char_length(song_artist) <= 200),
  add column if not exists song_url    text check (song_url is null or char_length(song_url) <= 500);

comment on column public.workouts.song_title is
  'Best song of the session (optional). Feeds the group playlist.';
comment on column public.workouts.song_url is
  'Optional Spotify / YouTube / Apple Music link for song_title.';

create index if not exists workouts_song_idx on public.workouts (date desc) where song_title is not null;
