import { supabase } from "./supabaseClient";
import type { WorkoutType } from "../types/database";

interface TemplateSetInput {
  exerciseId: string;
  weight: number;
  reps: number;
  restTimeSeconds: number | null;
}

interface SaveTemplateInput {
  userId: string;
  name: string;
  workoutType: WorkoutType;
  warmup: string | null;
  notes: string | null;
  durationMinutes: number | null;
  sport: string | null;
  discipline: string | null;
  distanceKm: number | null;
  sessionDetail: string | null;
  /** Ignored for endurance -- pass already in the order they should replay,
   * grouped by exercise (consecutive rows for the same exercise). */
  sets: TemplateSetInput[];
}

/** Shared by WorkoutForm (save the form you're building) and WorkoutDetail
 * (save an already-logged workout) -- same insert into
 * workout_templates + template_sets either way. */
export async function saveWorkoutAsTemplate(input: SaveTemplateInput): Promise<{ error: string | null }> {
  const { data: template, error } = await supabase
    .from("workout_templates")
    .insert({
      user_id: input.userId,
      name: input.name,
      workout_type: input.workoutType,
      warmup: input.warmup,
      notes: input.notes,
      duration_minutes: input.durationMinutes,
      sport: input.workoutType === "endurance" ? input.sport : null,
      discipline: input.workoutType === "endurance" ? input.discipline : null,
      distance_km: input.workoutType === "endurance" ? input.distanceKm : null,
      session_detail: input.workoutType === "endurance" ? input.sessionDetail : null,
    })
    .select()
    .single();

  if (error || !template) return { error: error?.message ?? "Failed to save template." };

  if (input.workoutType === "strength" && input.sets.length > 0) {
    const rows = input.sets.map((s, i) => ({
      template_id: template.id,
      exercise_id: s.exerciseId,
      weight: s.weight,
      reps: s.reps,
      rest_time_seconds: s.restTimeSeconds,
      set_order: i,
    }));
    const { error: setsError } = await supabase.from("template_sets").insert(rows);
    if (setsError) return { error: setsError.message };
  }

  return { error: null };
}
