import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import { SPORT_LABELS } from "../constants/sports";
import { computeStreak } from "../lib/streak";
import { loadDraft, draftHasContent } from "../lib/workoutDraft";
import ContributionGraph from "../components/ContributionGraph";
import type { Workout } from "../types/database";

function sportLabel(sport: string): string {
  return (SPORT_LABELS as Record<string, string>)[sport] ?? sport;
}

interface RecentWorkout extends Workout {
  sport: string | null;
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [workoutCount, setWorkoutCount] = useState<number | null>(null);
  const [workoutDates, setWorkoutDates] = useState<string[]>([]);
  const [streak, setStreak] = useState(computeStreak([]));
  const [loading, setLoading] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);

  // Checked once on mount -- WorkoutForm is the only thing that writes this,
  // and it re-checks itself when you navigate there, so this doesn't need
  // to react to anything after the initial paint.
  useEffect(() => {
    const draft = loadDraft();
    setHasDraft(!!draft && draftHasContent(draft));
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      const [{ data: workouts }, { data: weight }, { count }, { data: allDates }] = await Promise.all([
        supabase
          .from("workouts")
          .select("*, endurance_details(sport)")
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
        supabase.from("workouts").select("date").eq("user_id", user!.id),
      ]);
      if (cancelled) return;
      setRecentWorkouts(
        (workouts ?? []).map((w: any) => ({ ...w, sport: w.endurance_details?.sport ?? null }))
      );
      setLatestWeight(weight?.weight_kg ?? null);
      setWorkoutCount(count ?? 0);
      const dates = (allDates ?? []).map((w) => w.date);
      setWorkoutDates(dates);
      setStreak(computeStreak(dates));
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

      {hasDraft && (
        <Link to="/workouts/new" className="card-link" style={{ display: "block", marginBottom: 20 }}>
          <div className="row between">
            <span>
              📝 <strong>Workout in progress</strong> — continue filling
            </span>
            <span className="muted">→</span>
          </div>
        </Link>
      )}

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Activity</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {streak.current > 0 ? `🔥 ${streak.current}-day streak` : "No active streak"} · Best {streak.longest}
          </span>
        </div>
        <ContributionGraph dates={workoutDates} />
        <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
          {streak.current > 0
            ? streak.onRestDay
              ? "Resting today keeps the streak — train tomorrow to keep it going."
              : "Trained today — keep it up."
            : streak.brokenDaysAgo != null
              ? `Streak broke ${streak.brokenDaysAgo} days ago — one workout starts a new one.`
              : "Log a workout to start a streak. One rest day in a row won't break it."}
        </p>
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
                <strong>{w.sport ? sportLabel(w.sport) : formatDate(w.date)}</strong>
                <div className="row" style={{ gap: 6 }}>
                  {w.sport && <span className="chip">{formatDate(w.date)}</span>}
                  {w.duration_minutes != null && <span className="chip">{w.duration_minutes} min</span>}
                </div>
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
