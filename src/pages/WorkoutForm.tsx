import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { setVolume } from "../lib/format";

interface ExerciseOption {
  id: string;
  name: string;
  is_bodyweight: boolean;
}

interface SetRow {
  weight: string;
  reps: string;
  restSeconds: string;
}

interface ExerciseBlock {
  key: string;
  exerciseId: string;
  sets: SetRow[];
}

function emptySet(): SetRow {
  return { weight: "0", reps: "", restSeconds: "" };
}

export default function WorkoutForm() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [warmup, setWarmup] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("exercises")
      .select("id, name, is_bodyweight")
      .order("name")
      .then(({ data }) => setExerciseOptions(data ?? []));
    supabase
      .from("body_weight_logs")
      .select("weight_kg")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setBodyWeightKg(data?.weight_kg ?? null));
  }, [user]);

  function addBlock() {
    if (exerciseOptions.length === 0) return;
    setBlocks((prev) => [
      ...prev,
      { key: crypto.randomUUID(), exerciseId: exerciseOptions[0].id, sets: [emptySet()] },
    ]);
  }

  function updateBlock(key: string, exerciseId: string) {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, exerciseId } : b)));
  }

  function removeBlock(key: string) {
    setBlocks((prev) => prev.filter((b) => b.key !== key));
  }

  function addSet(key: string) {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, sets: [...b.sets, emptySet()] } : b)));
  }

  function updateSet(key: string, index: number, patch: Partial<SetRow>) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.key === key ? { ...b, sets: b.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : b
      )
    );
  }

  function removeSet(key: string, index: number) {
    setBlocks((prev) =>
      prev.map((b) => (b.key === key ? { ...b, sets: b.sets.filter((_, i) => i !== index) } : b))
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (blocks.length === 0 || blocks.every((b) => b.sets.length === 0)) {
      setError("Add at least one exercise with a set.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .insert({
        user_id: user.id,
        date,
        warmup: warmup.trim() || null,
        notes: notes.trim() || null,
        duration_minutes: duration ? Number(duration) : null,
      })
      .select()
      .single();

    if (workoutError || !workout) {
      setError(workoutError?.message ?? "Failed to create workout.");
      setSubmitting(false);
      return;
    }

    const setRows = blocks.flatMap((block, blockIndex) =>
      block.sets.map((s, setIndex) => ({
        workout_id: workout.id,
        exercise_id: block.exerciseId,
        weight: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        rest_time_seconds: s.restSeconds ? Number(s.restSeconds) : null,
        set_order: blockIndex * 1000 + setIndex,
      }))
    );

    const { error: setsError } = await supabase.from("sets").insert(setRows);
    setSubmitting(false);
    if (setsError) {
      setError(setsError.message);
      return;
    }
    navigate(`/workouts/${workout.id}`);
  }

  return (
    <div>
      <h1>Log a workout</h1>
      <form className="form-grid panel" onSubmit={handleSubmit}>
        <div className="row">
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="duration">Duration (min)</label>
            <input
              id="duration"
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="warmup">Warmup</label>
          <textarea id="warmup" rows={2} value={warmup} onChange={(e) => setWarmup(e.target.value)} />
        </div>

        <div>
          <div className="row between">
            <h3>Exercises</h3>
            <button type="button" onClick={addBlock} disabled={exerciseOptions.length === 0}>
              + Add exercise
            </button>
          </div>
          {exerciseOptions.length === 0 && (
            <p className="muted">No exercises in the library yet — add one first.</p>
          )}

          <div className="stack" style={{ gap: 16 }}>
            {blocks.map((block) => {
              const exercise = exerciseOptions.find((e) => e.id === block.exerciseId);
              return (
                <div key={block.key} className="panel">
                  <div className="row between">
                    <select value={block.exerciseId} onChange={(e) => updateBlock(block.key, e.target.value)}>
                      {exerciseOptions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="ghost" onClick={() => removeBlock(block.key)}>
                      Remove
                    </button>
                  </div>

                  <table style={{ marginTop: 10 }}>
                    <thead>
                      <tr>
                        <th>{exercise?.is_bodyweight ? "Added weight" : "Weight"}</th>
                        <th>Reps</th>
                        <th>Rest (s)</th>
                        {exercise?.is_bodyweight && <th>Volume</th>}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {block.sets.map((s, i) => {
                        const volume = setVolume({
                          isBodyweight: !!exercise?.is_bodyweight,
                          weight: Number(s.weight) || 0,
                          reps: Number(s.reps) || 0,
                          bodyWeightKg,
                        });
                        return (
                          <tr key={i}>
                            <td>
                              <input
                                type="number"
                                value={s.weight}
                                onChange={(e) => updateSet(block.key, i, { weight: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                value={s.reps}
                                onChange={(e) => updateSet(block.key, i, { reps: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                value={s.restSeconds}
                                onChange={(e) => updateSet(block.key, i, { restSeconds: e.target.value })}
                              />
                            </td>
                            {exercise?.is_bodyweight && (
                              <td className="muted">{volume ? volume.toFixed(0) : "—"}</td>
                            )}
                            <td>
                              <button type="button" className="ghost" onClick={() => removeSet(block.key, i)}>
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button type="button" className="ghost" onClick={() => addSet(block.key)} style={{ marginTop: 6 }}>
                    + Add set
                  </button>
                  {exercise?.is_bodyweight && bodyWeightKg == null && (
                    <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      Log your body weight in Profile to compute volume for bodyweight sets.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save workout"}
          </button>
        </div>
      </form>
    </div>
  );
}
