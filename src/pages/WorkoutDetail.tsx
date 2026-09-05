import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate, setVolume, type Equipment } from "../lib/format";
import { saveWorkoutAsTemplate } from "../lib/templates";
import { SPORT_LABELS, CLIMBING_DISCIPLINE_LABELS, type ClimbingDiscipline } from "../constants/sports";
import { CARDIO_ACTIVITY_LABELS, CARDIO_PURPOSE_LABELS, type CardioActivity, type CardioPurpose } from "../constants/cardio";
import type { Exercise, EnduranceDetails, Workout, WorkoutSet, CardioBlock } from "../types/database";

type ExerciseEquipmentFields = Pick<Exercise, "id" | "name" | "is_bodyweight" | "is_dumbbell" | "bar_weight_kg">;
type SetWithExercise = WorkoutSet & { exercise: ExerciseEquipmentFields };

function equipmentOf(exercise: ExerciseEquipmentFields): Equipment {
  return { isBodyweight: exercise.is_bodyweight, isDumbbell: exercise.is_dumbbell, barWeightKg: exercise.bar_weight_kg };
}

interface EditRow {
  weight: string;
  reps: string;
  rest: string;
}

function sportLabel(sport: string): string {
  return (SPORT_LABELS as Record<string, string>)[sport] ?? sport;
}

function cardioBlockDetails(c: CardioBlock): string {
  const parts: string[] = [];
  if (c.duration_minutes != null) parts.push(`${c.duration_minutes} min`);
  if (c.speed_kmh != null) parts.push(`${c.speed_kmh} km/h`);
  if (c.incline_percent != null) parts.push(`${c.incline_percent}% incline`);
  return parts.join(" · ") || "No details logged";
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<SetWithExercise[]>([]);
  const [cardioBlocks, setCardioBlocks] = useState<CardioBlock[]>([]);
  const [endurance, setEndurance] = useState<EnduranceDetails | null>(null);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Inline "click a value, change it" editing of the logged sets, without
  // leaving this page for the full /edit form (that form is still there for
  // structural changes -- adding/removing whole exercises).
  const [editingSets, setEditingSets] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, EditRow>>({});
  const [savingSets, setSavingSets] = useState(false);

  // Save-this-logged-workout-as-a-template, same as the one in WorkoutForm.
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const workoutId = id;
    async function load() {
      const { data: w } = await supabase.from("workouts").select("*").eq("id", workoutId).single();
      setWorkout(w ?? null);
      if (!w) {
        setLoading(false);
        return;
      }

      if (w.workout_type === "endurance") {
        const { data: details } = await supabase
          .from("endurance_details")
          .select("*")
          .eq("workout_id", workoutId)
          .maybeSingle();
        setEndurance(details ?? null);
      } else {
        const { data: s } = await supabase
          .from("sets")
          .select("*, exercise:exercises(id, name, is_bodyweight, is_dumbbell, bar_weight_kg)")
          .eq("workout_id", workoutId)
          .order("set_order");
        setSets((s as unknown as SetWithExercise[]) ?? []);
        const { data: cardio } = await supabase
          .from("cardio_blocks")
          .select("*")
          .eq("workout_id", workoutId)
          .order("block_order");
        setCardioBlocks(cardio ?? []);
        const { data: bw } = await supabase
          .from("body_weight_logs")
          .select("weight_kg")
          .eq("user_id", w.user_id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setBodyWeightKg(bw?.weight_kg ?? null);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; equipment: Equipment; sets: SetWithExercise[] }>();
    for (const s of sets) {
      const existing = map.get(s.exercise_id);
      if (existing) existing.sets.push(s);
      else map.set(s.exercise_id, { name: s.exercise.name, equipment: equipmentOf(s.exercise), sets: [s] });
    }
    return Array.from(map.values());
  }, [sets]);

  const totalVolume = useMemo(
    () =>
      sets.reduce(
        (sum, s) =>
          sum +
          setVolume({
            equipment: equipmentOf(s.exercise),
            weight: s.weight,
            reps: s.reps,
            bodyWeightKg,
          }),
        0
      ),
    [sets, bodyWeightKg]
  );

  async function handleDelete() {
    if (!id || !confirm("Delete this workout?")) return;
    setDeleting(true);
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    setDeleting(false);
    if (!error) navigate("/workouts");
  }

  function startEditingSets() {
    const values: Record<string, EditRow> = {};
    for (const s of sets) {
      values[s.id] = {
        weight: String(s.weight),
        reps: String(s.reps),
        rest: s.rest_time_seconds != null ? String(s.rest_time_seconds) : "",
      };
    }
    setEditValues(values);
    setEditingSets(true);
  }

  function updateEditRow(setId: string, patch: Partial<EditRow>) {
    setEditValues((prev) => ({ ...prev, [setId]: { ...prev[setId], ...patch } }));
  }

  async function removeSetRow(setId: string) {
    const { error } = await supabase.from("sets").delete().eq("id", setId);
    if (error) {
      setError(error.message);
      return;
    }
    setSets((prev) => prev.filter((s) => s.id !== setId));
    setEditValues((prev) => {
      const next = { ...prev };
      delete next[setId];
      return next;
    });
  }

  async function saveSetEdits() {
    setSavingSets(true);
    setError(null);
    const updates = sets.map((s) => {
      const edited = editValues[s.id];
      return supabase
        .from("sets")
        .update({
          weight: Number(edited.weight) || 0,
          reps: Number(edited.reps) || 0,
          rest_time_seconds: edited.rest ? Number(edited.rest) : null,
        })
        .eq("id", s.id);
    });
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    setSavingSets(false);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }
    setSets((prev) =>
      prev.map((s) => ({
        ...s,
        weight: Number(editValues[s.id].weight) || 0,
        reps: Number(editValues[s.id].reps) || 0,
        rest_time_seconds: editValues[s.id].rest ? Number(editValues[s.id].rest) : null,
      }))
    );
    setEditingSets(false);
  }

  async function handleSaveAsTemplate() {
    if (!user || !workout || !templateName.trim()) return;
    setSavingTemplate(true);
    setError(null);

    const { error: saveError } = await saveWorkoutAsTemplate({
      userId: user.id,
      name: templateName.trim(),
      workoutType: workout.workout_type,
      warmup: workout.warmup,
      notes: workout.notes,
      durationMinutes: workout.duration_minutes,
      sport: endurance?.sport ?? null,
      discipline: endurance?.discipline ?? null,
      distanceKm: endurance?.distance_km ?? null,
      sessionDetail: endurance?.session_detail ?? null,
      sets: sets.map((s) => ({
        exerciseId: s.exercise_id,
        weight: s.weight,
        reps: s.reps,
        restTimeSeconds: s.rest_time_seconds,
      })),
    });

    setSavingTemplate(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setShowSaveTemplate(false);
    setTemplateName("");
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 3000);
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!workout) return <p className="muted">Workout not found.</p>;

  const isOwner = workout.user_id === user?.id;
  const isEndurance = workout.workout_type === "endurance";

  return (
    <div>
      <div className="row between">
        <h1>{isEndurance && endurance ? sportLabel(endurance.sport) : formatDate(workout.date)}</h1>
        <div className="row">
          {isEndurance && <span className="chip">{formatDate(workout.date)}</span>}
          {workout.duration_minutes != null && <span className="chip">{workout.duration_minutes} min</span>}
          {!isEndurance && <span className="chip focus">{totalVolume.toFixed(0)} kg total volume</span>}
        </div>
      </div>

      {isEndurance ? (
        <div className="panel">
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            {endurance?.discipline && (
              <span className="chip primary">
                {CLIMBING_DISCIPLINE_LABELS[endurance.discipline as ClimbingDiscipline] ?? endurance.discipline}
              </span>
            )}
            {endurance?.distance_km != null && <span className="chip">{endurance.distance_km} km</span>}
          </div>
          {endurance?.session_detail && (
            <>
              <p className="eyebrow">
                {endurance.sport === "climbing" ? "Boulders / routes done" : "Session detail"}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{endurance.session_detail}</p>
            </>
          )}
          {!endurance?.session_detail && !endurance?.distance_km && !endurance?.discipline && (
            <p className="muted">No extra details logged for this session.</p>
          )}
        </div>
      ) : (
        <>
          {workout.warmup && (
            <div className="panel">
              <p className="eyebrow">Warmup</p>
              <p>{workout.warmup}</p>
            </div>
          )}

          {cardioBlocks.length > 0 && (
            <div className="panel" style={{ marginTop: workout.warmup ? 12 : 0 }}>
              <p className="eyebrow" style={{ marginBottom: 8 }}>
                Cardio
              </p>
              <div className="stack" style={{ gap: 8 }}>
                {cardioBlocks.map((c) => (
                  <div key={c.id} className="row between">
                    <span>
                      {CARDIO_ACTIVITY_LABELS[c.activity as CardioActivity] ?? c.activity}{" "}
                      <span className="muted">
                        ({CARDIO_PURPOSE_LABELS[c.purpose as CardioPurpose] ?? c.purpose})
                      </span>
                    </span>
                    <span className="muted">{cardioBlockDetails(c)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            {grouped.map((g) => (
              <div key={g.name} className="panel">
                <div className="row between">
                  <h3>{g.name}</h3>
                  <div className="row" style={{ gap: 6 }}>
                    {g.equipment.isDumbbell && <span className="chip focus">Dumbbell ×2</span>}
                    {g.equipment.barWeightKg != null && (
                      <span className="chip focus">Barbell +{g.equipment.barWeightKg} kg</span>
                    )}
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>
                          {g.equipment.isBodyweight
                            ? "Added weight"
                            : g.equipment.isDumbbell
                              ? "Weight (per dumbbell)"
                              : g.equipment.barWeightKg != null
                                ? "Weight (added to bar)"
                                : "Weight"}
                        </th>
                        <th>Reps</th>
                        <th>Rest</th>
                        <th>Volume</th>
                        {editingSets && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {g.sets.map((s, i) => {
                        const edited = editValues[s.id];
                        const weight = editingSets && edited ? Number(edited.weight) || 0 : s.weight;
                        const reps = editingSets && edited ? Number(edited.reps) || 0 : s.reps;
                        return (
                          <tr key={s.id}>
                            <td>{i + 1}</td>
                            {editingSets && edited ? (
                              <>
                                <td>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={edited.weight}
                                    onChange={(e) => updateEditRow(s.id, { weight: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    value={edited.reps}
                                    onChange={(e) => updateEditRow(s.id, { reps: e.target.value })}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    value={edited.rest}
                                    onChange={(e) => updateEditRow(s.id, { rest: e.target.value })}
                                  />
                                </td>
                              </>
                            ) : (
                              <>
                                <td>{s.weight}</td>
                                <td>{s.reps}</td>
                                <td>{s.rest_time_seconds != null ? `${s.rest_time_seconds}s` : "—"}</td>
                              </>
                            )}
                            <td>
                              {setVolume({ equipment: g.equipment, weight, reps, bodyWeightKg }).toFixed(0)}
                            </td>
                            {editingSets && (
                              <td>
                                <button type="button" className="ghost" onClick={() => removeSetRow(s.id)}>
                                  ✕
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {isOwner && sets.length > 0 && (
            <div className="row" style={{ marginTop: 12 }}>
              {editingSets ? (
                <>
                  <button type="button" className="primary" onClick={saveSetEdits} disabled={savingSets}>
                    {savingSets ? "Saving…" : "Save values"}
                  </button>
                  <button type="button" className="ghost" onClick={() => setEditingSets(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" onClick={startEditingSets}>
                  Edit values
                </button>
              )}
            </div>
          )}
        </>
      )}

      {workout.notes && (
        <div className="panel" style={{ marginTop: 12 }}>
          <p className="eyebrow">{isEndurance ? "General comment" : "Notes"}</p>
          <p>{workout.notes}</p>
        </div>
      )}

      {isOwner && (
        <div className="panel" style={{ marginTop: 12 }}>
          <p className="eyebrow" style={{ margin: "0 0 8px" }}>
            Template
          </p>
          {showSaveTemplate ? (
            <div className="row">
              <input
                autoFocus
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                style={{ maxWidth: 240 }}
              />
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                disabled={savingTemplate || !templateName.trim()}
              >
                {savingTemplate ? "Saving…" : "Save"}
              </button>
              <button type="button" className="ghost" onClick={() => setShowSaveTemplate(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="row">
              <button type="button" className="ghost" onClick={() => setShowSaveTemplate(true)}>
                Save as template
              </button>
              {templateSaved && <span className="muted">Saved.</span>}
            </div>
          )}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {isOwner && (
        <div className="row" style={{ marginTop: 16 }}>
          <Link to={`/workouts/${workout.id}/edit`}>
            <button type="button">Edit</button>
          </Link>
          <button type="button" className="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete workout"}
          </button>
        </div>
      )}
    </div>
  );
}
