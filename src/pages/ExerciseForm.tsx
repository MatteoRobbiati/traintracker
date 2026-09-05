import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import MuscleChecklist from "../components/MuscleChecklist";
import MuscleMap from "../components/MuscleMap";
import type { Muscle } from "../constants/muscles";

// The three affect weight/volume calculation differently (see
// src/lib/format.ts effectiveWeight()) and don't compose -- picking one here
// resets the others, matching the exercise_equipment_exclusive DB constraint.
type EquipmentKind = "none" | "bodyweight" | "dumbbell" | "barbell";
const DEFAULT_BAR_WEIGHT = "20";

export default function ExerciseForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [equipment, setEquipment] = useState<EquipmentKind>("none");
  const [barWeight, setBarWeight] = useState(DEFAULT_BAR_WEIGHT);
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
          if (data.is_bodyweight) setEquipment("bodyweight");
          else if (data.is_dumbbell) setEquipment("dumbbell");
          else if (data.bar_weight_kg != null) {
            setEquipment("barbell");
            setBarWeight(String(data.bar_weight_kg));
          } else setEquipment("none");
          setPrimary(data.primary_muscles);
          setSecondary(data.secondary_muscles);
        }
        setLoading(false);
      });
  }, [id]);

  function cycleMuscle(m: Muscle) {
    // none -> primary -> secondary -> none, so clicking the figure alone is
    // enough to fully assign muscles without touching the checklists.
    if (primary.includes(m)) {
      setPrimary(primary.filter((x) => x !== m));
      setSecondary([...secondary, m]);
    } else if (secondary.includes(m)) {
      setSecondary(secondary.filter((x) => x !== m));
    } else {
      setPrimary([...primary, m]);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      is_bodyweight: equipment === "bodyweight",
      is_dumbbell: equipment === "dumbbell",
      bar_weight_kg: equipment === "barbell" ? Number(barWeight) || 0 : null,
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
        <div className="field">
          <label>Equipment</label>
          <div className="row">
            <button type="button" className={equipment === "none" ? "primary" : ""} onClick={() => setEquipment("none")}>
              Standard
            </button>
            <button
              type="button"
              className={equipment === "bodyweight" ? "primary" : ""}
              onClick={() => setEquipment("bodyweight")}
            >
              Bodyweight
            </button>
            <button
              type="button"
              className={equipment === "dumbbell" ? "primary" : ""}
              onClick={() => setEquipment("dumbbell")}
            >
              Dumbbell
            </button>
            <button
              type="button"
              className={equipment === "barbell" ? "primary" : ""}
              onClick={() => setEquipment("barbell")}
            >
              Barbell
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
            {equipment === "bodyweight" && "Logged weight is added weight on top of body weight (can be negative for assisted)."}
            {equipment === "dumbbell" && "Logged weight is per dumbbell — volume/total doubles it automatically."}
            {equipment === "barbell" && "Logged weight is what's added — the bar's own weight below is added on top."}
            {equipment === "none" && "Logged weight is the full working weight, as-is."}
          </p>
          {equipment === "barbell" && (
            <div className="field" style={{ maxWidth: 160, marginTop: 8 }}>
              <label htmlFor="barWeight">Bar weight (kg)</label>
              <input
                id="barWeight"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                value={barWeight}
                onChange={(e) => setBarWeight(e.target.value)}
              />
            </div>
          )}
        </div>

        <MuscleChecklist label="Primary muscles" selected={primary} disabledMuscles={secondary} onChange={setPrimary} />
        <MuscleChecklist
          label="Secondary muscles"
          selected={secondary}
          disabledMuscles={primary}
          onChange={setSecondary}
        />

        <div>
          <p className="eyebrow">Preview</p>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
            You can also click a muscle directly — it cycles none → primary → secondary → none.
          </p>
          <MuscleMap primaryMuscles={primary} secondaryMuscles={secondary} onMuscleClick={cycleMuscle} />
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
