import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import { isBetterSet, type BestSetCandidate } from "../lib/personalBest";
import MuscleMap from "../components/MuscleMap";
import { MUSCLE_LABELS } from "../constants/muscles";
import type { Exercise } from "../types/database";

export default function ExerciseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [personalBest, setPersonalBest] = useState<BestSetCandidate | null>(null);
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
    supabase
      .from("sets")
      .select("weight, reps, workout:workouts!inner(date, user_id)")
      .eq("exercise_id", id)
      .eq("workout.user_id", user.id)
      .then(({ data }) => {
        const isBodyweight = exercise?.is_bodyweight ?? false;
        let best: BestSetCandidate | null = null;
        for (const row of (data as any[]) ?? []) {
          const candidate: BestSetCandidate = { weight: row.weight, reps: row.reps, date: row.workout.date };
          if (isBetterSet(candidate, best, isBodyweight)) best = candidate;
        }
        setPersonalBest(best);
      });
    // Depends on exercise.is_bodyweight too, but that's only known once the
    // exercise itself has loaded -- re-runs once it has.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, exercise?.is_bodyweight]);

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
        {exercise.is_bodyweight && <span className="chip focus">Bodyweight</span>}
      </div>

      {exercise.description && <p className="muted">{exercise.description}</p>}

      {personalBest && (
        <div className="panel">
          <p className="eyebrow" style={{ margin: "0 0 4px" }}>
            Your personal best
          </p>
          <h2 style={{ margin: 0 }}>
            {exercise.is_bodyweight
              ? `${personalBest.reps} reps${personalBest.weight ? ` (${personalBest.weight > 0 ? "+" : ""}${personalBest.weight} kg)` : ""}`
              : `${personalBest.weight} kg × ${personalBest.reps}`}
          </h2>
          <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
            {formatDate(personalBest.date)}
          </p>
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
