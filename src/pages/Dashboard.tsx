import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import type { Workout } from "../types/database";

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [workoutCount, setWorkoutCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      const [{ data: workouts }, { data: weight }, { count }] = await Promise.all([
        supabase
          .from("workouts")
          .select("*")
          .eq("user_id", user!.id)
          .order("date", { ascending: false })
          .limit(5),
        supabase
          .from("body_weight_logs")
          .select("weight_kg")
          .eq("user_id", user!.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("workouts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user!.id),
      ]);
      if (cancelled) return;
      setRecentWorkouts(workouts ?? []);
      setLatestWeight(weight?.weight_kg ?? null);
      setWorkoutCount(count ?? 0);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div>
      <p className="eyebrow">Welcome back</p>
      <h1>{profile?.name ?? "Dashboard"}</h1>

      <div className="row" style={{ margin: "16px 0 24px" }}>
        <Link to="/workouts/new">
          <button type="button" className="primary">
            + Log a workout
          </button>
        </Link>
        <Link to="/exercises/new">
          <button type="button">+ Add exercise</button>
        </Link>
      </div>

      <div className="row" style={{ gap: 12, marginBottom: 20 }}>
        <div className="panel" style={{ flex: 1 }}>
          <p className="eyebrow">Latest body weight</p>
          <h2>{latestWeight != null ? `${latestWeight} kg` : "—"}</h2>
          <Link to="/profile" className="muted">
            Log weight →
          </Link>
        </div>
        <div className="panel" style={{ flex: 1 }}>
          <p className="eyebrow">Workouts logged</p>
          <h2>{workoutCount ?? "—"}</h2>
        </div>
      </div>

      <div className="panel">
        <h3>Recent workouts</h3>
        {loading && <p className="muted">Loading…</p>}
        {!loading && recentWorkouts.length === 0 && (
          <p className="muted">No workouts logged yet — get started above.</p>
        )}
        <div className="card-list">
          {recentWorkouts.map((w) => (
            <Link key={w.id} to={`/workouts/${w.id}`} className="card-link">
              <div className="row between">
                <strong>{formatDate(w.date)}</strong>
                {w.duration_minutes != null && <span className="chip">{w.duration_minutes} min</span>}
              </div>
              {w.notes && <p className="muted" style={{ margin: "4px 0 0" }}>{w.notes}</p>}
            </Link>
          ))}
        </div>
        {recentWorkouts.length > 0 && (
          <p style={{ marginTop: 12 }}>
            <Link to="/workouts">View all workouts →</Link>
          </p>
        )}
      </div>
    </div>
  );
}
