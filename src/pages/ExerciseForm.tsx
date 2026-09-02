import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import MuscleChecklist from "../components/MuscleChecklist";
import MuscleMap from "../components/MuscleMap";
import type { Muscle } from "../constants/muscles";

export default function ExerciseForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isBodyweight, setIsBodyweight] = useState(false);
  const [primary, setPrimary] = useState<Muscle[]>([]);
  const [secondary, setSecondary] = useState<Muscle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("exercises")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.name);
          setDescription(data.description ?? "");
          setIsBodyweight(data.is_bodyweight);
          setPrimary(data.primary_muscles);
          setSecondary(data.secondary_muscles);
        }
        setLoading(false);
      });
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      is_bodyweight: isBodyweight,
      primary_muscles: primary,
      secondary_muscles: secondary,
    };

    const result = isEdit
      ? await supabase.from("exercises").update(payload).eq("id", id!)
      : await supabase.from("exercises").insert({ ...payload, created_by: user!.id }).select().single();

    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const targetId = isEdit ? id : (result.data as { id: string }).id;
    navigate(`/exercises/${targetId}`);
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>{isEdit ? "Edit exercise" : "New exercise"}</h1>
      <form className="form-grid panel" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="description">Description / cues</label>
          <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <label className="row" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={isBodyweight}
            onChange={(e) => setIsBodyweight(e.target.checked)}
          />
          This is a bodyweight exercise
        </label>

        <MuscleChecklist label="Primary muscles" selected={primary} disabledMuscles={secondary} onChange={setPrimary} />
        <MuscleChecklist
          label="Secondary muscles"
          selected={secondary}
          disabledMuscles={primary}
          onChange={setSecondary}
        />

        <div>
          <p className="eyebrow">Preview</p>
          <MuscleMap primaryMuscles={primary} secondaryMuscles={secondary} />
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create exercise"}
          </button>
        </div>
      </form>
    </div>
  );
}
