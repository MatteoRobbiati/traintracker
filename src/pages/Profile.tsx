import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ACCENTS } from "../lib/theme";
import { formatDate } from "../lib/format";
import type { BodyWeightLog } from "../types/database";
import type { ThemeMode } from "../lib/theme";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export default function Profile() {
  const { user, profile } = useAuth();
  const { mode, accent, setMode, setAccent } = useTheme();
  const [logs, setLogs] = useState<BodyWeightLog[]>([]);
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
    loadLogs().then(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
