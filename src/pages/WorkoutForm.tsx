import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { setVolume } from "../lib/format";
import { SPORTS, SPORT_LABELS, CLIMBING_DISCIPLINES, CLIMBING_DISCIPLINE_LABELS } from "../constants/sports";
import type { WorkoutType } from "../types/database";

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

const OTHER_SPORT = "other";

export default function WorkoutForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);

  const [workoutType, setWorkoutType] = useState<WorkoutType>("strength");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [warmup, setWarmup] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);

  // Endurance-only fields
  const [sport, setSport] = useState<string>(SPORTS[0]);
  const [customSport, setCustomSport] = useState("");
  const [discipline, setDiscipline] = useState<string>("");
  const [distanceKm, setDistanceKm] = useState("");
  const [sessionDetail, setSessionDetail] = useState("");

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

  // Load the existing workout (+ sets, or endurance details) when editing.
  // Sets are reconstructed into "blocks" by grouping consecutive
  // same-exercise sets in set_order (that's how they were laid out on save).
  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data: w } = await supabase.from("workouts").select("*").eq("id", id!).single();
      if (!w) {
        setLoading(false);
        return;
      }
      setDate(w.date);
      setWarmup(w.warmup ?? "");
      setNotes(w.notes ?? "");
      setDuration(w.duration_minutes != null ? String(w.duration_minutes) : "");
      setWorkoutType(w.workout_type);

      if (w.workout_type === "endurance") {
        const { data: details } = await supabase
          .from("endurance_details")
          .select("*")
          .eq("workout_id", id!)
          .single();
        if (details) {
          if ((SPORTS as readonly string[]).includes(details.sport)) {
            setSport(details.sport);
          } else {
            setSport(OTHER_SPORT);
            setCustomSport(details.sport);
          }
          setDiscipline(details.discipline ?? "");
          setDistanceKm(details.distance_km != null ? String(details.distance_km) : "");
          setSessionDetail(details.session_detail ?? "");
        }
      } else {
        const { data: s } = await supabase.from("sets").select("*").eq("workout_id", id!).order("set_order");
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
      }
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

    const resolvedSport = sport === OTHER_SPORT ? customSport.trim() : sport;
    if (workoutType === "endurance" && !resolvedSport) {
      setError("Pick a sport (or type one in).");
      return;
    }
    if (workoutType === "strength" && (blocks.length === 0 || blocks.every((b) => b.sets.length === 0))) {
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
      workout_type: workoutType,
    };

    let workoutId = id;
    if (isEdit) {
      const { error: updateError } = await supabase.from("workouts").update(workoutPayload).eq("id", id!);
      if (updateError) {
        setError(updateError.message);
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

    if (workoutType === "endurance") {
      const { error: detailsError } = await supabase.from("endurance_details").upsert({
        workout_id: workoutId!,
        sport: resolvedSport,
        discipline: sport === "climbing" && discipline ? discipline : null,
        distance_km: distanceKm ? Number(distanceKm) : null,
        session_detail: sessionDetail.trim() || null,
      });
      setSubmitting(false);
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
    } else {
      if (isEdit) {
        // Simplest consistent way to persist edited sets: replace them all
        // rather than diffing add/remove/reorder client-side.
        const { error: deleteError } = await supabase.from("sets").delete().eq("workout_id", id!);
        if (deleteError) {
          setError(deleteError.message);
          setSubmitting(false);
          return;
        }
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
    }

    navigate(`/workouts/${workoutId}`);
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>{isEdit ? "Edit workout" : "Log a workout"}</h1>
      <form className="form-grid panel" onSubmit={handleSubmit}>
        {isEdit ? (
          <span className="chip focus" style={{ width: "fit-content" }}>
            {workoutType === "endurance" ? "Endurance" : "Strength"}
          </span>
        ) : (
          <div className="field">
            <label>Type</label>
            <div className="row">
              <button
                type="button"
                className={workoutType === "strength" ? "primary" : ""}
                onClick={() => setWorkoutType("strength")}
              >
                Strength
              </button>
              <button
                type="button"
                className={workoutType === "endurance" ? "primary" : ""}
                onClick={() => setWorkoutType("endurance")}
              >
                Endurance
              </button>
            </div>
          </div>
        )}

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

        {workoutType === "strength" ? (
          <>
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
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => addSet(block.key)}
                        style={{ marginTop: 6 }}
                      >
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
          </>
        ) : (
          <>
            <div className="row">
              <div className="field" style={{ minWidth: 160 }}>
                <label htmlFor="sport">Sport</label>
                <select id="sport" value={sport} onChange={(e) => setSport(e.target.value)}>
                  {SPORTS.map((s) => (
                    <option key={s} value={s}>
                      {SPORT_LABELS[s]}
                    </option>
                  ))}
                  <option value={OTHER_SPORT}>Other…</option>
                </select>
              </div>
              {sport === OTHER_SPORT && (
                <div className="field" style={{ minWidth: 160 }}>
                  <label htmlFor="customSport">Sport name</label>
                  <input
                    id="customSport"
                    required
                    value={customSport}
                    onChange={(e) => setCustomSport(e.target.value)}
                    placeholder="e.g. yoga"
                  />
                </div>
              )}
              {sport === "climbing" && (
                <div className="field" style={{ minWidth: 160 }}>
                  <label htmlFor="discipline">Discipline</label>
                  <select id="discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                    <option value="">—</option>
                    {CLIMBING_DISCIPLINES.map((d) => (
                      <option key={d} value={d}>
                        {CLIMBING_DISCIPLINE_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field" style={{ minWidth: 140 }}>
                <label htmlFor="distance">Distance (km)</label>
                <input
                  id="distance"
                  type="number"
                  min={0}
                  step="0.1"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="sessionDetail">
                {sport === "climbing" ? "Boulders / routes done" : "Session detail"}
              </label>
              <textarea
                id="sessionDetail"
                rows={3}
                value={sessionDetail}
                onChange={(e) => setSessionDetail(e.target.value)}
                placeholder={sport === "climbing" ? "e.g. 3x V3, 1x V5, onsight" : "Splits, effort, route, etc."}
              />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="notes">{workoutType === "endurance" ? "General comment" : "Notes"}</label>
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
