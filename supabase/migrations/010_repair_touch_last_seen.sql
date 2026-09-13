-- ============================================================================
-- Repair migration: touch_last_seen() and its grant have been in schema.sql
-- since the very first commit, but "last seen" reportedly never advances
-- past account creation for some users -- which is exactly what you'd see
-- if this function (or its execute grant) never actually made it into the
-- deployed database, or was dropped/altered by hand at some point. This
-- re-creates both idempotently; harmless to run even if they already exist
-- exactly like this.
-- Run this once in the SQL Editor of an existing project.
-- ============================================================================

create or replace function public.touch_last_seen()
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;

grant execute on function public.touch_last_seen() to authenticated;
