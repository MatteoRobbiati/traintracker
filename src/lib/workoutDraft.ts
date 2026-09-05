// Autosaves a new (not-yet-submitted) workout's in-progress fields to
// localStorage, so switching sections of the app -- or just closing the
// tab -- doesn't lose what's been typed in. Deliberately per-device
// (localStorage, not Supabase): an unsaved draft isn't real data yet, and
// there's no account to share it with anyone else anyway.
//
// Only ever one draft at a time (a new workout being composed) -- editing
// an *existing* logged workout doesn't touch this, that's already backed by
// the database.
import type { WorkoutType } from "../types/database";

export interface WorkoutDraftBlock {
  exerciseId: string;
  sets: { weight: string; reps: string; restSeconds: string }[];
}

export interface WorkoutDraftCardioBlock {
  activity: string;
  purpose: string;
  durationMinutes: string;
  inclinePercent: string;
  speedKmh: string;
}

export interface WorkoutDraft {
  workoutType: WorkoutType;
  date: string;
  warmup: string;
  notes: string;
  duration: string;
  blocks: WorkoutDraftBlock[];
  cardioBlocks: WorkoutDraftCardioBlock[];
  sport: string;
  customSport: string;
  discipline: string;
  distanceKm: string;
  sessionDetail: string;
  /** ISO timestamp of the last autosave, for the "continue filling" banner. */
  savedAt: string;
}

const DRAFT_KEY = "traintrack:workout-draft";

/** Whether a draft actually has something worth surfacing/restoring, as
 * opposed to a pristine blank form that happened to autosave once. */
export function draftHasContent(draft: Pick<WorkoutDraft, "blocks" | "cardioBlocks" | "warmup" | "notes" | "duration" | "sessionDetail" | "distanceKm" | "customSport">): boolean {
  return (
    draft.blocks.some((b) => b.sets.some((s) => s.reps.trim() !== "" || Number(s.weight) !== 0)) ||
    draft.cardioBlocks.length > 0 ||
    draft.warmup.trim() !== "" ||
    draft.notes.trim() !== "" ||
    draft.duration.trim() !== "" ||
    draft.sessionDetail.trim() !== "" ||
    draft.distanceKm.trim() !== "" ||
    draft.customSport.trim() !== ""
  );
}

export function loadDraft(): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkoutDraft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Omit<WorkoutDraft, "savedAt">): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    /* storage disabled/full -- the form still works, it just won't autosave */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
