import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate, setVolume } from "../lib/format";
import { SPORT_LABELS, CLIMBING_DISCIPLINE_LABELS, type ClimbingDiscipline } from "../constants/sports";
import type { Exercise, EnduranceDetails, Workout, WorkoutSet } from "../types/database";

type SetWithExercise = WorkoutSet & { exercise: Pick<Exercise, "id" | "name" | "is_bodyweight"> };

function sportLabel(sport: string): string {
  return (SPORT_LABELS as Record<string, string>)[sport] ?? sport;
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<SetWithExercise[]>([]);
  const [endurance, setEndurance] = useState<EnduranceDetails | null>(null);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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
          .select("*, exercise:exercises(id, name, is_bodyweight)")
          .eq("workout_id", workoutId)
          .order("set_order");
        setSets((s as unknown as SetWithExercise[]) ?? []);
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
    if (!id || !confirm("Delete this workout?")) return;
    setDeleting(true);
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    setDeleting(false);
    if (!error) navigate("/workouts");
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

          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            {grouped.map((g) => (
              <div key={g.name} className="panel">
                <h3>{g.name}</h3>
                <div className="table-scroll">
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
              </div>
            ))}
          </div>
        </>
      )}

      {workout.notes && (
        <div className="panel" style={{ marginTop: 12 }}>
          <p className="eyebrow">{isEndurance ? "General comment" : "Notes"}</p>
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
