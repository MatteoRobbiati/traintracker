import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate, setVolume, effectiveWeight, type Equipment } from "../lib/format";
import { isBetterSet, bestVolumeSession, type BestSetCandidate, type BestVolumeCandidate } from "../lib/personalBest";
import MuscleMap from "../components/MuscleMap";
import { MUSCLE_LABELS } from "../constants/muscles";
import type { Exercise } from "../types/database";

function equipmentOf(exercise: Exercise): Equipment {
  return { isBodyweight: exercise.is_bodyweight, isDumbbell: exercise.is_dumbbell, barWeightKg: exercise.bar_weight_kg };
}

export default function ExerciseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [personalBest, setPersonalBest] = useState<BestSetCandidate | null>(null);
  const [bestVolume, setBestVolume] = useState<BestVolumeCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("exercises")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setExercise(data ?? null);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    Promise.all([
      supabase
        .from("sets")
        .select("workout_id, weight, reps, workout:workouts!inner(date, user_id)")
        .eq("exercise_id", id)
        .eq("workout.user_id", user.id),
      supabase
        .from("body_weight_logs")
        .select("weight_kg")
        .eq("user_id", user.id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([{ data }, { data: bw }]) => {
      if (!exercise) return;
      const equipment = equipmentOf(exercise);
      const bodyWeightKg = bw?.weight_kg ?? null;
      let best: BestSetCandidate | null = null;
      const volumeSets = ((data as any[]) ?? []).map((row) => {
        const candidate: BestSetCandidate = { weight: row.weight, reps: row.reps, date: row.workout.date };
        if (isBetterSet(candidate, best, equipment.isBodyweight)) best = candidate;
        return {
          workoutId: row.workout_id,
          date: row.workout.date,
          volume: setVolume({ equipment, weight: row.weight, reps: row.reps, bodyWeightKg }),
        };
      });
      setPersonalBest(best);
      setBestVolume(bestVolumeSession(volumeSets));
    });
    // Depends on exercise (is_bodyweight/is_dumbbell/bar_weight_kg) too, but
    // that's only known once the exercise itself has loaded -- re-runs once
    // it has.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, exercise]);

  async function handleDelete() {
    if (!id || !confirm("Delete this exercise? This can't be undone.")) return;
    setDeleting(true);
    const { error } = await supabase.from("exercises").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate("/exercises");
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!exercise) return <p className="muted">Exercise not found.</p>;

  const isOwner = exercise.created_by === user?.id;
  const hasNoMuscles = exercise.primary_muscles.length === 0 && exercise.secondary_muscles.length === 0;

  return (
    <div>
      <div className="row between">
        <h1>{exercise.name}</h1>
        <div className="row" style={{ gap: 6 }}>
          {exercise.is_bodyweight && <span className="chip focus">Bodyweight</span>}
          {exercise.is_dumbbell && <span className="chip focus">Dumbbell — ×2 for volume</span>}
          {exercise.bar_weight_kg != null && (
            <span className="chip focus">Barbell — +{exercise.bar_weight_kg} kg bar</span>
          )}
        </div>
      </div>

      {exercise.description && <p className="muted">{exercise.description}</p>}

      {(personalBest || bestVolume) && (
        <div className="row" style={{ gap: 12 }}>
          {personalBest && (
            <div className="panel" style={{ flex: 1, minWidth: 150 }}>
              <p className="eyebrow" style={{ margin: "0 0 4px" }}>
                Best set (massimale)
              </p>
              <h2 style={{ margin: 0 }}>
                {exercise.is_bodyweight
                  ? `${personalBest.reps} reps${personalBest.weight ? ` (${personalBest.weight > 0 ? "+" : ""}${personalBest.weight} kg)` : ""}`
                  : `${effectiveWeight(equipmentOf(exercise), personalBest.weight, null)} kg × ${personalBest.reps}`}
              </h2>
              {(exercise.is_dumbbell || exercise.bar_weight_kg != null) && (
                <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                  {exercise.is_dumbbell
                    ? `${personalBest.weight} kg × 2 dumbbells`
                    : `${personalBest.weight} kg + ${exercise.bar_weight_kg} kg bar`}
                </p>
              )}
              <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                {formatDate(personalBest.date)}
              </p>
            </div>
          )}
          {bestVolume && (
            <div className="panel" style={{ flex: 1, minWidth: 150 }}>
              <p className="eyebrow" style={{ margin: "0 0 4px" }}>
                Best session volume
              </p>
              <h2 style={{ margin: 0 }}>{bestVolume.volume.toFixed(0)} kg</h2>
              <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                {formatDate(bestVolume.date)}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        {hasNoMuscles && (
          <p className="error-text" style={{ marginTop: 0 }}>
            No muscles assigned to this exercise — it won't show up in Group's muscle heat chart.
            {isOwner ? " Edit it below to add some." : ""}
          </p>
        )}
        <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
          Click a muscle to see every exercise that involves it.
        </p>
        <MuscleMap
          primaryMuscles={exercise.primary_muscles}
          secondaryMuscles={exercise.secondary_muscles}
          onMuscleClick={(m) => navigate(`/exercises?muscle=${m}`)}
        />
        <div className="muscle-legend">
          <div className="muscle-legend-item"><span className="swatch primary" />Primary muscle</div>
          <div className="muscle-legend-item"><span className="swatch secondary" />Secondary muscle</div>
        </div>
        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          {exercise.primary_muscles.map((m) => (
            <span key={m} className="chip primary">{MUSCLE_LABELS[m]}</span>
          ))}
          {exercise.secondary_muscles.map((m) => (
            <span key={m} className="chip">{MUSCLE_LABELS[m]}</span>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="row" style={{ marginTop: 16 }}>
          <Link to={`/exercises/${exercise.id}/edit`}>
            <button type="button">Edit</button>
          </Link>
          <button type="button" className="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
