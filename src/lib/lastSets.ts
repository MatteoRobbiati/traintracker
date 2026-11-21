// "What did this person do last time on this exercise?" -- the default sets
// for a newly added exercise block, and each training partner's weights.
//
// Ordering note: an earlier version queried `sets` and ordered with
// `.order("date", { foreignTable: "workout" })`. In PostgREST that only
// orders the *embedded* rows, never the parent ones, so "the latest session"
// was effectively whichever came back first (often an old, heavy one that
// looked like a personal best). Querying `workouts` -- where `date` is a real
// column -- and embedding the matching sets fixes that.
import { supabase } from "./supabaseClient";

export interface LastSet {
  weight: number;
  reps: number;
  restSeconds: number | null;
}

export interface LastSession {
  date: string;
  sets: LastSet[];
}

interface WorkoutWithSets {
  id: string;
  date: string;
  created_at: string;
  sets: { exercise_id: string; weight: number; reps: number; rest_time_seconds: number | null; set_order: number }[];
}

/** Most recent session (by date, then by when it was logged) in which
 * `userId` did `exerciseId`, with that session's sets for it in order.
 * `excludeWorkoutId` skips the workout currently being edited. */
export async function fetchLastSession(
  userId: string,
  exerciseId: string,
  excludeWorkoutId?: string
): Promise<LastSession | null> {
  let q = supabase
    .from("workouts")
    .select("id, date, created_at, sets!inner(exercise_id, weight, reps, rest_time_seconds, set_order)")
    .eq("user_id", userId)
    .eq("sets.exercise_id", exerciseId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (excludeWorkoutId) q = q.neq("id", excludeWorkoutId);
  const { data, error } = await q;
  if (error || !data || data.length === 0) return null;
  const w = data[0] as unknown as WorkoutWithSets;
  return {
    date: w.date,
    sets: [...w.sets]
      .sort((a, b) => a.set_order - b.set_order)
      .map((s) => ({ weight: Number(s.weight), reps: s.reps, restSeconds: s.rest_time_seconds })),
  };
}

/** For each exercise, the weights `userId` used in their latest session of
 * it -- one query over their recent workouts rather than one per exercise. */
export async function fetchLastWeightsByExercise(
  userId: string,
  exerciseIds: string[]
): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  if (exerciseIds.length === 0) return result;
  const { data } = await supabase
    .from("workouts")
    .select("id, date, created_at, sets!inner(exercise_id, weight, reps, rest_time_seconds, set_order)")
    .eq("user_id", userId)
    .in("sets.exercise_id", exerciseIds)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  for (const w of (data ?? []) as unknown as WorkoutWithSets[]) {
    const byExercise = new Map<string, WorkoutWithSets["sets"]>();
    for (const s of w.sets) {
      if (s.exercise_id in result) continue; // already have a more recent session
      const list = byExercise.get(s.exercise_id) ?? [];
      list.push(s);
      byExercise.set(s.exercise_id, list);
    }
    for (const [exerciseId, sets] of byExercise) {
      result[exerciseId] = sets.sort((a, b) => a.set_order - b.set_order).map((s) => Number(s.weight));
    }
  }
  return result;
}

/** Exercises this user did recently, most recent first -- shown at the top
 * of the exercise picker so the usual ones are one tap away. */
export async function fetchRecentExerciseIds(userId: string, workouts = 12): Promise<string[]> {
  const { data } = await supabase
    .from("workouts")
    .select("date, created_at, sets(exercise_id, set_order)")
    .eq("user_id", userId)
    .eq("workout_type", "strength")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(workouts);
  const seen: string[] = [];
  for (const w of (data ?? []) as unknown as { sets: { exercise_id: string; set_order: number }[] }[]) {
    for (const s of [...(w.sets ?? [])].sort((a, b) => a.set_order - b.set_order)) {
      if (!seen.includes(s.exercise_id)) seen.push(s.exercise_id);
    }
  }
  return seen;
}
