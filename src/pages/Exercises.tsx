import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import MuscleMap from "../components/MuscleMap";
import { MUSCLE_LABELS, MUSCLES, type Muscle } from "../constants/muscles";
import type { Exercise } from "../types/database";

function isMuscle(value: string): value is Muscle {
  return (MUSCLES as readonly string[]).includes(value);
}

export default function Exercises() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(false);

  const muscleParam = searchParams.get("muscle") ?? "";
  const muscleFilter: Muscle | "" = isMuscle(muscleParam) ? muscleParam : "";

  useEffect(() => {
    if (muscleFilter) setShowMap(true);
  }, [muscleFilter]);

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

  function setMuscleFilter(next: Muscle | "") {
    setSearchParams(next ? { muscle: next } : {}, { replace: true });
  }

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

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row">
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

        <button type="button" className="ghost" style={{ marginTop: 10 }} onClick={() => setShowMap((v) => !v)}>
          {showMap ? "Hide" : "Browse by muscle"} {showMap ? "▴" : "▾"}
        </button>

        {showMap && (
          <div style={{ marginTop: 12 }}>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
              Click a muscle to filter the list below. Click it again to clear.
            </p>
            <MuscleMap
              primaryMuscles={muscleFilter ? [muscleFilter] : []}
              secondaryMuscles={[]}
              onMuscleClick={(m) => setMuscleFilter(muscleFilter === m ? "" : m)}
            />
          </div>
        )}
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
