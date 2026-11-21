import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { relativeTime, todayLocalIso } from "../lib/format";
import { SPORT_LABELS } from "../constants/sports";
import { NEWS_ROOM } from "../constants/rooms";
import { computeStreak } from "../lib/streak";
import { loadDraft, draftHasContent } from "../lib/workoutDraft";
import ContributionGraph from "../components/ContributionGraph";
import WorkoutCard, { type WorkoutCardData } from "../components/WorkoutCard";
import { ChevronRightIcon, CloseIcon, PlusIcon, RepeatIcon } from "../components/icons";
import type { AppOutletContext } from "../App";

function sportLabel(sport: string): string {
  return (SPORT_LABELS as Record<string, string>)[sport] ?? sport;
}

interface NewsMessage {
  id: string;
  body: string;
  created_at: string;
  senderName: string;
}

// Which "what's new" post someone has already dismissed, per browser.
const NEWS_SEEN_KEY = "traintrack:lastSeenNewsMessageId";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late session?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const { openChat } = useOutletContext<AppOutletContext>();
  const [latestNews, setLatestNews] = useState<NewsMessage | null>(null);
  const [newsDismissed, setNewsDismissed] = useState(true);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutCardData[]>([]);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [allWorkoutsLite, setAllWorkoutsLite] = useState<
    { id: string; date: string; durationMinutes: number | null; sport: string | null }[]
  >([]);
  const [streak, setStreak] = useState(computeStreak([]));
  const [loading, setLoading] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    const draft = loadDraft();
    setHasDraft(!!draft && draftHasContent(draft));
  }, []);

  useEffect(() => {
    supabase
      .from("messages")
      .select("id, body, created_at, sender:profiles(name)")
      .eq("room", NEWS_ROOM)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const news: NewsMessage = {
          id: data.id,
          body: data.body,
          created_at: data.created_at,
          senderName: (data as any).sender?.name ?? "Someone",
        };
        setLatestNews(news);
        let seen: string | null = null;
        try {
          seen = localStorage.getItem(NEWS_SEEN_KEY);
        } catch {
          /* storage unavailable */
        }
        setNewsDismissed(seen === news.id);
      });
  }, []);

  function dismissNews() {
    try {
      if (latestNews) localStorage.setItem(NEWS_SEEN_KEY, latestNews.id);
    } catch {
      /* ignore */
    }
    setNewsDismissed(true);
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      const [{ data: workouts }, { data: weight }, { data: allWorkouts }] = await Promise.all([
        supabase
          .from("workouts")
          .select("*, sets(set_order, exercise:exercises(name)), endurance_details(sport), logger:profiles!logged_by_id(name)")
          .eq("user_id", user!.id)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("body_weight_logs")
          .select("weight_kg")
          .eq("user_id", user!.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("workouts").select("id, date, duration_minutes, endurance_details(sport)").eq("user_id", user!.id),
      ]);
      if (cancelled) return;
      setRecentWorkouts(
        (workouts ?? []).map((w: any) => ({
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
        }))
      );
      setLatestWeight(weight?.weight_kg ?? null);
      const lite = (allWorkouts ?? []).map((w: any) => ({
        id: w.id,
        date: w.date,
        durationMinutes: w.duration_minutes,
        sport: w.endurance_details?.sport ?? null,
      }));
      setAllWorkoutsLite(lite);
      setStreak(computeStreak(lite.map((w) => w.date)));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const graphWorkouts = useMemo(
    () =>
      allWorkoutsLite.map((w) => ({
        id: w.id,
        date: w.date,
        label: w.sport ? sportLabel(w.sport) : `Strength${w.durationMinutes != null ? ` · ${w.durationMinutes} min` : ""}`,
      })),
    [allWorkoutsLite]
  );

  const thisWeek = useMemo(() => {
    const since = daysAgoIso(6);
    return allWorkoutsLite.filter((w) => w.date >= since).length;
  }, [allWorkoutsLite]);

  const trainedToday = allWorkoutsLite.some((w) => w.date === todayLocalIso());
  const lastWorkout = recentWorkouts[0];
  const firstName = profile?.name?.split(" ")[0];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1>{firstName ?? "Welcome"} 👋</h1>
        </div>
      </div>

      {latestNews && !newsDismissed && (
        <div className="banner">
          <span style={{ fontSize: 20 }}>📣</span>
          <div className="banner-body">
            <p className="banner-title">What's new</p>
            <p className="small" style={{ whiteSpace: "pre-wrap" }}>
              {latestNews.body}
            </p>
            <p className="muted tiny" style={{ marginTop: 4 }}>
              {latestNews.senderName} · {relativeTime(latestNews.created_at)} ·{" "}
              <button
                type="button"
                className="linklike"
                style={{ padding: 0, color: "var(--ember)", fontSize: 12 }}
                onClick={() => {
                  dismissNews();
                  openChat(NEWS_ROOM);
                }}
              >
                See all
              </button>
            </p>
          </div>
          <button type="button" className="icon-btn sm" onClick={dismissNews} aria-label="Dismiss">
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      )}

      {/* Primary action */}
      <div className="stack" style={{ gap: 10, marginBottom: 20 }}>
        <Link to="/workouts/new" className="btn primary lg block" style={{ padding: "18px 22px", fontSize: 16 }}>
          <PlusIcon width={20} height={20} strokeWidth={2.4} />
          {hasDraft ? "Continue your workout" : trainedToday ? "Log another workout" : "Start a workout"}
        </Link>
        {lastWorkout && !hasDraft && lastWorkout.workout_type === "strength" && (
          <Link to={`/workouts/new?from=${lastWorkout.id}`} className="btn block">
            <RepeatIcon width={16} height={16} /> Repeat last session
            {lastWorkout.exerciseNames.length > 0 && (
              <span className="muted truncate" style={{ fontWeight: 500, maxWidth: "50%" }}>
                · {lastWorkout.exerciseNames.slice(0, 2).join(", ")}
              </span>
            )}
          </Link>
        )}
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 16 }}>
        <div className="stat-card">
          <p className="stat-label">Streak</p>
          <div className="stat-value">
            {streak.current}
            <small>{streak.current > 0 ? "🔥" : "days"}</small>
          </div>
        </div>
        <div className="stat-card">
          <p className="stat-label">Last 7 days</p>
          <div className="stat-value">{thisWeek}</div>
        </div>
        <Link to="/profile" className="stat-card">
          <p className="stat-label">Weight</p>
          <div className="stat-value">
            {latestWeight != null ? latestWeight : "—"}
            {latestWeight != null && <small>kg</small>}
          </div>
        </Link>
      </div>

      <div className="panel" style={{ marginBottom: 8 }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Activity</h3>
          <span className="muted tiny">
            Best streak {streak.longest} · {allWorkoutsLite.length} total
          </span>
        </div>
        <ContributionGraph workouts={graphWorkouts} />
        <p className="muted tiny" style={{ margin: "10px 0 0" }}>
          {streak.current > 0
            ? streak.onRestDay
              ? "Resting today keeps the streak — train tomorrow to keep it going."
              : "Trained today — keep it up."
            : streak.brokenDaysAgo != null
              ? `Streak broke ${streak.brokenDaysAgo} days ago — one workout starts a new one.`
              : "Log a workout to start a streak. One rest day in a row won't break it."}
        </p>
      </div>

      <div className="section-title">
        <h3>Recent</h3>
        {recentWorkouts.length > 0 && (
          <Link to="/workouts" className="small row nowrap" style={{ gap: 2 }}>
            All workouts <ChevronRightIcon width={16} height={16} />
          </Link>
        )}
      </div>
      {loading && <p className="muted">Loading…</p>}
      {!loading && recentWorkouts.length === 0 && (
        <div className="empty-state">
          <span className="emoji">🏁</span>
          No workouts yet — tap <strong>Start a workout</strong> above.
        </div>
      )}
      <div className="card-list">
        {recentWorkouts.map((w) => (
          <WorkoutCard key={w.id} w={w} />
        ))}
      </div>
    </div>
  );
}
