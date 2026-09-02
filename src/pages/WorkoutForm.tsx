import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  const { id } = useParams();
  const isEdit = Boolean(id);
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
  const [loading, setLoading] = useState(isEdit);

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

  // Load the existing workout + sets when editing, and reconstruct the
  // exercise "blocks" by grouping consecutive same-exercise sets in
  // set_order (that's how they were originally laid out when saved).
  useEffect(() => {
    if (!id) return;
    async function load() {
      const [{ data: w }, { data: s }] = await Promise.all([
        supabase.from("workouts").select("*").eq("id", id!).single(),
        supabase.from("sets").select("*").eq("workout_id", id!).order("set_order"),
      ]);
      if (w) {
        setDate(w.date);
        setWarmup(w.warmup ?? "");
        setNotes(w.notes ?? "");
        setDuration(w.duration_minutes != null ? String(w.duration_minutes) : "");
      }
      const loadedBlocks: ExerciseBlock[] = [];
      for (const row of s ?? []) {
        const last = loadedBlocks[loadedBlocks.length - 1];
        const set: SetRow = {
          weight: String(row.weight),
          reps: String(row.reps),
          restSeconds: row.rest_time_seconds != null ? String(row.rest_time_seconds) : "",
        };
        if (last && last.exerciseId === row.exercise_id) {
          last.sets.push(set);
        } else {
          loadedBlocks.push({ key: crypto.randomUUID(), exerciseId: row.exercise_id, sets: [set] });
        }
      }
      setBlocks(loadedBlocks);
      setLoading(false);
    }
    load();
  }, [id]);

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

    const workoutPayload = {
      date,
      warmup: warmup.trim() || null,
      notes: notes.trim() || null,
      duration_minutes: duration ? Number(duration) : null,
    };

    let workoutId = id;
    if (isEdit) {
      const { error: updateError } = await supabase.from("workouts").update(workoutPayload).eq("id", id!);
      if (updateError) {
        setError(updateError.message);
        setSubmitting(false);
        return;
      }
      // Simplest consistent way to persist edited sets: replace them all
      // rather than diffing add/remove/reorder client-side.
      const { error: deleteError } = await supabase.from("sets").delete().eq("workout_id", id!);
      if (deleteError) {
        setError(deleteError.message);
        setSubmitting(false);
        return;
      }
    } else {
      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({ ...workoutPayload, user_id: user.id })
        .select()
        .single();
      if (workoutError || !workout) {
        setError(workoutError?.message ?? "Failed to create workout.");
        setSubmitting(false);
        return;
      }
      workoutId = workout.id;
    }

    const setRows = blocks.flatMap((block, blockIndex) =>
      block.sets.map((s, setIndex) => ({
        workout_id: workoutId!,
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
    navigate(`/workouts/${workoutId}`);
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>{isEdit ? "Edit workout" : "Log a workout"}</h1>
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
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Save workout"}
          </button>
        </div>
      </form>
    </div>
  );
}
