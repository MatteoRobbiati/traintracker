import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ACCENTS, accentColors, resolveIsDark, type ThemeMode, type AccentId } from "../lib/theme";
import { computeStreak } from "../lib/streak";
import { formatDate } from "../lib/format";
import ContributionGraph from "../components/ContributionGraph";
import type { BodyWeightLog } from "../types/database";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

// Routed as both /profile (self) and /profile/:userId (a connection) --
// picks which to render here so each keeps its own simple hook tree rather
// than branching mid-component.
export default function Profile() {
  const { userId } = useParams();
  const { user } = useAuth();
  if (userId && userId !== user?.id) return <OtherProfile userId={userId} />;
  return <OwnProfile />;
}

function OwnProfile() {
  const { user, profile } = useAuth();
  const { mode, accent, setMode, setAccent } = useTheme();
  const [logs, setLogs] = useState<BodyWeightLog[]>([]);
  const [workoutDates, setWorkoutDates] = useState<string[]>([]);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadLogs() {
    if (!user) return;
    const { data } = await supabase
      .from("body_weight_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false });
    setLogs(data ?? []);
  }

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadLogs(),
      supabase
        .from("workouts")
        .select("date")
        .eq("user_id", user.id)
        .then(({ data }) => setWorkoutDates((data ?? []).map((w) => w.date))),
    ]).then(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const streak = useMemo(() => computeStreak(workoutDates), [workoutDates]);

  // Recharts wants oldest-first; the table below wants newest-first, so
  // this doesn't touch `logs` itself, just the chart's own view of it.
  const weightSeries = useMemo(
    () =>
      logs
        .slice()
        .reverse()
        .map((l) => ({ date: formatDate(l.recorded_at), weight_kg: l.weight_kg })),
    [logs]
  );

  async function handleAddWeight(e: FormEvent) {
    e.preventDefault();
    if (!user || !weight) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase
      .from("body_weight_logs")
      .insert({ user_id: user.id, weight_kg: Number(weight) });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setWeight("");
    loadLogs();
  }

  return (
    <div>
      <h1>{profile?.name ?? "Profile"}</h1>

      <div className="panel">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Activity</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {streak.current > 0 ? `🔥 ${streak.current}-day streak` : "No active streak"} · Best {streak.longest}
          </span>
        </div>
        <ContributionGraph dates={workoutDates} />
      </div>

      <div className="panel">
        <h3>Appearance</h3>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Theme</label>
          <div className="row">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={mode === m.id ? "primary" : ""}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Accent color</label>
          <div className="row" style={{ gap: 10 }}>
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-label={a.label}
                aria-pressed={accent === a.id}
                onClick={() => setAccent(a.id)}
                title={a.label}
                style={{
                  width: 34,
                  height: 34,
                  padding: 0,
                  borderRadius: "50%",
                  background: a.swatch,
                  border: accent === a.id ? "3px solid var(--ink)" : "3px solid transparent",
                  boxShadow: accent === a.id ? "none" : "0 0 0 1px var(--line)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Log body weight</h3>
        <form className="row" onSubmit={handleAddWeight}>
          <div className="field" style={{ minWidth: 140 }}>
            <label htmlFor="weight">Weight (kg)</label>
            <input
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              required
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <button type="submit" className="primary" disabled={submitting} style={{ alignSelf: "flex-end" }}>
            {submitting ? "Saving…" : "Add entry"}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}

        {!loading && logs.length > 1 && (
          <ResponsiveContainer width="100%" height={200} style={{ marginTop: 16 }}>
            <LineChart data={weightSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--ink-soft)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--ink-soft)" domain={["auto", "auto"]} unit="kg" />
              <Tooltip contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }} />
              <Line type="monotone" dataKey="weight_kg" stroke="var(--ember)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {!loading && logs.length > 0 && (
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Weight (kg)</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 10).map((l) => (
                <tr key={l.id}>
                  <td>{formatDate(l.recorded_at)}</td>
                  <td>{l.weight_kg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && logs.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No entries yet.</p>}
      </div>
    </div>
  );
}

// Read-only: a connection's name + their activity calendar, in *their*
// chosen accent color (not the viewer's) -- see ContributionGraph's
// colorOverride / lib/theme.ts accentColors(). Everything else on Profile
// (appearance settings, body-weight logging) is self-only and stays out of
// this view entirely. RLS gates the actual workout dates on connection
// status -- an empty result here reads the same whether not connected yet
// or genuinely no activity, which is the same privacy-safe phrasing used
// elsewhere (e.g. Group's empty state).
function OtherProfile({ userId }: { userId: string }) {
  const { mode } = useTheme();
  const [target, setTarget] = useState<{ name: string; accent: AccentId } | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: p }, { data: workouts }] = await Promise.all([
        supabase.from("profiles").select("name, accent").eq("id", userId).maybeSingle(),
        supabase.from("workouts").select("date").eq("user_id", userId),
      ]);
      if (cancelled) return;
      setTarget(p ?? null);
      setDates((workouts ?? []).map((w) => w.date));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <p className="muted">Loading…</p>;
  if (!target) return <p className="muted">Profile not found.</p>;

  const colors = accentColors(target.accent, resolveIsDark(mode));

  return (
    <div>
      <h1>{target.name}</h1>
      <div className="panel">
        <h3>Activity</h3>
        {dates.length > 0 ? (
          <ContributionGraph dates={dates} colorOverride={colors} />
        ) : (
          <p className="muted">
            No activity to show — either {target.name} hasn't logged a workout yet, or you're not connected
            (Connections page).
          </p>
        )}
      </div>
    </div>
  );
}
