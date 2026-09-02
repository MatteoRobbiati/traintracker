import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import MuscleMap from "../components/MuscleMap";
import { MUSCLE_LABELS } from "../constants/muscles";
import type { Exercise } from "../types/database";

export default function ExerciseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState<Exercise | null>(null);
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

  return (
    <div>
      <div className="row between">
        <h1>{exercise.name}</h1>
        {exercise.is_bodyweight && <span className="chip focus">Bodyweight</span>}
      </div>

      {exercise.description && <p className="muted">{exercise.description}</p>}

      <div className="panel">
        <MuscleMap primaryMuscles={exercise.primary_muscles} secondaryMuscles={exercise.secondary_muscles} />
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
