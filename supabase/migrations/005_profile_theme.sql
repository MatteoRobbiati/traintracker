-- ============================================================================
-- Migration: account-synced appearance (theme mode + accent color), so a
-- preference set on one device/browser follows you everywhere you log in
-- instead of staying stuck in that browser's localStorage.
-- Run this once in the SQL Editor of an existing project. A fresh project
-- can just run the updated schema.sql instead.
-- ============================================================================

alter table public.profiles
  add column theme_mode text not null default 'system' check (theme_mode in ('system', 'light', 'dark')),
  add column accent      text not null default 'ember'  check (accent in ('ember', 'ocean', 'forest', 'grape', 'rose'));

comment on column public.profiles.theme_mode is
  'Appearance preference, synced across devices -- see src/context/ThemeContext.tsx.';
comment on column public.profiles.accent is
  'Accent color id from src/lib/theme.ts ACCENTS -- keep the CHECK list in sync with it.';
