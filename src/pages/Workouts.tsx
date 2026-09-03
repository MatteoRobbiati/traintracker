import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import { SPORT_LABELS } from "../constants/sports";
import type { Workout } from "../types/database";

interface WorkoutWithExtras extends Workout {
  exerciseNames: string[];
  sport: string | null;
}

function sportLabel(sport: string): string {
  return (SPORT_LABELS as Record<string, string>)[sport] ?? sport;
}

export default function Workouts() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutWithExtras[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "strength" | "endurance">("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("workouts")
      .select("*, sets(exercise:exercises(name)), endurance_details(sport)")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .then(({ data }) => {
        const mapped = (data ?? []).map((w: any) => ({
          ...w,
          exerciseNames: Array.from(
            new Set((w.sets ?? []).map((s: any) => s.exercise?.name).filter(Boolean))
          ) as string[],
          sport: w.endurance_details?.sport ?? null,
        }));
        setWorkouts(mapped);
        setLoading(false);
      });
  }, [user]);

  const exerciseOptions = useMemo(() => {
    const names = new Set<string>();
    workouts.forEach((w) => w.exerciseNames.forEach((n) => names.add(n)));
    return Array.from(names).sort();
  }, [workouts]);

  const filtered = useMemo(() => {
    return workouts.filter((w) => {
      if (from && w.date < from) return false;
      if (to && w.date > to) return false;
      if (typeFilter && w.workout_type !== typeFilter) return false;
      if (exerciseFilter && !w.exerciseNames.includes(exerciseFilter)) return false;
      return true;
    });
  }, [workouts, from, to, exerciseFilter, typeFilter]);

  return (
    <div>
      <div className="row between">
        <h1>Workout history</h1>
        <Link to="/workouts/new">
          <button type="button" className="primary">
            + Log a workout
          </button>
        </Link>
      </div>

      <div className="row panel" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <label htmlFor="type">Type</label>
          <select id="type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
            <option value="">All types</option>
            <option value="strength">Strength</option>
            <option value="endurance">Endurance</option>
          </select>
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label htmlFor="exercise">Exercise</label>
          <select id="exercise" value={exerciseFilter} onChange={(e) => setExerciseFilter(e.target.value)}>
            <option value="">All exercises</option>
            {exerciseOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="muted">No workouts match these filters.</p>}

      <div className="card-list">
        {filtered.map((w) => (
          <Link key={w.id} to={`/workouts/${w.id}`} className="card-link">
            <div className="row between">
              <strong>{w.sport ? sportLabel(w.sport) : formatDate(w.date)}</strong>
              <div className="row" style={{ gap: 6 }}>
                {w.sport && <span className="chip">{formatDate(w.date)}</span>}
                {w.duration_minutes != null && <span className="chip">{w.duration_minutes} min</span>}
              </div>
            </div>
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              {w.exerciseNames.map((n) => (
                <span key={n} className="chip">
                  {n}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
