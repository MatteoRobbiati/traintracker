import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate, setVolume } from "../lib/format";
import type { Exercise, Workout, WorkoutSet } from "../types/database";

type SetWithExercise = WorkoutSet & { exercise: Pick<Exercise, "id" | "name" | "is_bodyweight"> };

export default function WorkoutDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<SetWithExercise[]>([]);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    const workoutId = id;
    async function load() {
      const [{ data: w }, { data: s }] = await Promise.all([
        supabase.from("workouts").select("*").eq("id", workoutId).single(),
        supabase
          .from("sets")
          .select("*, exercise:exercises(id, name, is_bodyweight)")
          .eq("workout_id", workoutId)
          .order("set_order"),
      ]);
      setWorkout(w ?? null);
      setSets((s as unknown as SetWithExercise[]) ?? []);
      if (w) {
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
    const map = new Map<string, { name: string; isBodyweight: boolean; sets: SetWithExercise[] }>();
    for (const s of sets) {
      const existing = map.get(s.exercise_id);
      if (existing) existing.sets.push(s);
      else map.set(s.exercise_id, { name: s.exercise.name, isBodyweight: s.exercise.is_bodyweight, sets: [s] });
    }
    return Array.from(map.values());
  }, [sets]);

  const totalVolume = useMemo(
    () =>
      sets.reduce(
        (sum, s) =>
          sum +
          setVolume({
            isBodyweight: s.exercise.is_bodyweight,
            weight: s.weight,
            reps: s.reps,
            bodyWeightKg,
          }),
        0
      ),
    [sets, bodyWeightKg]
  );

  async function handleDelete() {
    if (!id || !confirm("Delete this workout and all its sets?")) return;
    setDeleting(true);
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    setDeleting(false);
    if (!error) navigate("/workouts");
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!workout) return <p className="muted">Workout not found.</p>;

  const isOwner = workout.user_id === user?.id;

  return (
    <div>
      <div className="row between">
        <h1>{formatDate(workout.date)}</h1>
        <div className="row">
          {workout.duration_minutes != null && <span className="chip">{workout.duration_minutes} min</span>}
          <span className="chip focus">{totalVolume.toFixed(0)} kg total volume</span>
        </div>
      </div>

      {workout.warmup && (
        <div className="panel">
          <p className="eyebrow">Warmup</p>
          <p>{workout.warmup}</p>
        </div>
      )}

      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {grouped.map((g) => (
          <div key={g.name} className="panel">
            <h3>{g.name}</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{g.isBodyweight ? "Added weight" : "Weight"}</th>
                  <th>Reps</th>
                  <th>Rest</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {g.sets.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td>{s.weight}</td>
                    <td>{s.reps}</td>
                    <td>{s.rest_time_seconds != null ? `${s.rest_time_seconds}s` : "—"}</td>
                    <td>
                      {setVolume({
                        isBodyweight: g.isBodyweight,
                        weight: s.weight,
                        reps: s.reps,
                        bodyWeightKg,
                      }).toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {workout.notes && (
        <div className="panel" style={{ marginTop: 12 }}>
          <p className="eyebrow">Notes</p>
          <p>{workout.notes}</p>
        </div>
      )}

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
