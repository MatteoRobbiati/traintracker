import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useConnections } from "../hooks/useConnections";
import ConnectionActions from "../components/ConnectionActions";
import { formatDate, relativeTime } from "../lib/format";
import type { BodyWeightLog } from "../types/database";

const STATUS_PRIORITY = {
  incoming_pending: 0,
  accepted: 1,
  outgoing_pending: 2,
  rejected: 3,
  none: 4,
} as const;

export default function Profile() {
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState<BodyWeightLog[]>([]);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    rows,
    loading: connectionsLoading,
    error: connectionError,
    busyId,
    requestAccess,
    respond,
    removeConnection,
    requestAgain,
  } = useConnections();

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

  const sortedRows = [...rows].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);

  return (
    <div>
      <h1>{profile?.name ?? "Profile"}</h1>

      <div className="panel">
        <h3>Log body weight</h3>
        <form className="row" onSubmit={handleAddWeight}>
          <div className="field" style={{ minWidth: 140 }}>
            <label htmlFor="weight">Weight (kg)</label>
            <input
              id="weight"
              type="number"
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

      <div className="panel">
        <h3>Group</h3>
        <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
          Everyone's name is visible, but workouts and body weight stay private until you two connect —
          request access below, or accept a request someone sent you. You can also do this from the chat
          panel's online list.
        </p>
        {connectionError && <p className="error-text">{connectionError}</p>}
        {connectionsLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Last seen</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.profile.id}>
                  <td>{row.profile.name}</td>
                  <td className="muted">{relativeTime(row.profile.last_seen)}</td>
                  <td>
                    <ConnectionActions
                      row={row}
                      busy={busyId === row.profile.id || busyId === row.connection?.id}
                      onRequest={requestAccess}
                      onAccept={(id) => respond(id, "accepted")}
                      onReject={(id) => respond(id, "rejected")}
                      onRemove={removeConnection}
                      onRequestAgain={requestAgain}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
