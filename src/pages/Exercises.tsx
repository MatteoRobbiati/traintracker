import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { MUSCLE_LABELS, type Muscle } from "../constants/muscles";
import type { Exercise } from "../types/database";

export default function Exercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<Muscle | "">("");

  useEffect(() => {
    supabase
      .from("exercises")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setExercises(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
      const matchesMuscle =
        !muscleFilter ||
        ex.primary_muscles.includes(muscleFilter) ||
        ex.secondary_muscles.includes(muscleFilter);
      return matchesSearch && matchesMuscle;
    });
  }, [exercises, search, muscleFilter]);

  return (
    <div>
      <div className="row between">
        <h1>Exercises</h1>
        <Link to="/exercises/new">
          <button type="button" className="primary">
            + New exercise
          </button>
        </Link>
      </div>

      <div className="row panel" style={{ marginBottom: 16 }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="search">Search</label>
          <input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Exercise name…" />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label htmlFor="muscle">Muscle</label>
          <select id="muscle" value={muscleFilter} onChange={(e) => setMuscleFilter(e.target.value as Muscle | "")}>
            <option value="">All muscles</option>
            {Object.entries(MUSCLE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="muted">No exercises match.</p>}

      <div className="card-list">
        {filtered.map((ex) => (
          <Link key={ex.id} to={`/exercises/${ex.id}`} className="card-link">
            <div className="row between">
              <strong>{ex.name}</strong>
              {ex.is_bodyweight && <span className="chip focus">Bodyweight</span>}
            </div>
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              {ex.primary_muscles.map((m) => (
                <span key={m} className="chip primary">
                  {MUSCLE_LABELS[m]}
                </span>
              ))}
              {ex.secondary_muscles.map((m) => (
                <span key={m} className="chip">
                  {MUSCLE_LABELS[m]}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
