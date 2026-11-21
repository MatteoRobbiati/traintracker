import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import WorkoutCard, { type WorkoutCardData } from "../components/WorkoutCard";
import Disclosure from "../components/Disclosure";
import { PlusIcon } from "../components/icons";

function monthLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function Workouts() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "strength" | "endurance">("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("workouts")
      .select("*, sets(set_order, exercise:exercises(name)), endurance_details(sport), logger:profiles!logged_by_id(name)")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        const mapped: WorkoutCardData[] = (data ?? []).map((w: any) => ({
          id: w.id,
          date: w.date,
          workout_type: w.workout_type,
          duration_minutes: w.duration_minutes,
          sport: w.endurance_details?.sport ?? null,
          exerciseNames: Array.from(
            new Set(
              [...(w.sets ?? [])]
                .sort((a: any, b: any) => a.set_order - b.set_order)
                .map((s: any) => s.exercise?.name)
                .filter(Boolean)
            )
          ) as string[],
          songTitle: w.song_title ?? null,
          songArtist: w.song_artist ?? null,
          loggedByName: w.logged_by_id && w.logged_by_id !== w.user_id ? (w.logger?.name ?? "a friend") : null,
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

  const filtered = useMemo(
    () =>
      workouts.filter((w) => {
        if (from && w.date < from) return false;
        if (to && w.date > to) return false;
        if (typeFilter && w.workout_type !== typeFilter) return false;
        if (exerciseFilter && !w.exerciseNames.includes(exerciseFilter)) return false;
        return true;
      }),
    [workouts, from, to, exerciseFilter, typeFilter]
  );

  const byMonth = useMemo(() => {
    const groups: { label: string; items: WorkoutCardData[] }[] = [];
    for (const w of filtered) {
      const label = monthLabel(w.date);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(w);
      else groups.push({ label, items: [w] });
    }
    return groups;
  }, [filtered]);

  const activeFilters = [from, to, exerciseFilter, typeFilter].filter(Boolean).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Workouts</h1>
          {!loading && (
            <p className="sub">
              {workouts.length} logged{activeFilters > 0 ? ` · ${filtered.length} shown` : ""}
            </p>
          )}
        </div>
        <Link to="/workouts/new" className="btn primary">
          <PlusIcon width={18} height={18} /> New
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Disclosure
          autoOpen={activeFilters > 0}
          summary={
            <>
              Filters
              {activeFilters > 0 && <span className="nav-count">{activeFilters}</span>}
            </>
          }
        >
          <div className="segmented full" role="group" aria-label="Type">
            {(["", "strength", "endurance"] as const).map((t) => (
              <button key={t || "all"} type="button" aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {t === "" ? "All" : t === "strength" ? "Strength" : "Endurance"}
              </button>
            ))}
          </div>
          <div className="row nowrap" style={{ gap: 10 }}>
            <div className="field grow">
              <label htmlFor="from">From</label>
              <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field grow">
              <label htmlFor="to">To</label>
              <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="field">
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
          {activeFilters > 0 && (
            <button
              type="button"
              className="ghost sm"
              style={{ justifySelf: "start" }}
              onClick={() => {
                setFrom("");
                setTo("");
                setExerciseFilter("");
                setTypeFilter("");
              }}
            >
              Clear filters
            </button>
          )}
        </Disclosure>
      </div>

      {loadError && <p className="error-text">{loadError}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && workouts.length === 0 && (
        <div className="empty-state">
          <span className="emoji">🏋️</span>
          <p>No workouts yet.</p>
          <Link to="/workouts/new" className="btn primary">
            Log your first one
          </Link>
        </div>
      )}
      {!loading && workouts.length > 0 && filtered.length === 0 && (
        <div className="empty-state">No workouts match these filters.</div>
      )}

      {byMonth.map((g) => (
        <section key={g.label} style={{ marginBottom: 20 }}>
          <p className="eyebrow" style={{ margin: "0 4px 8px" }}>
            {g.label} · {g.items.length}
          </p>
          <div className="card-list">
            {g.items.map((w) => (
              <WorkoutCard key={w.id} w={w} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
