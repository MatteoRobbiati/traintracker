import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { formatDate, relativeTime } from "../lib/format";
import type { BodyWeightLog, Connection, Profile as ProfileType } from "../types/database";

type RowStatus = "self" | "accepted" | "incoming_pending" | "outgoing_pending" | "rejected" | "none";

export default function Profile() {
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState<BodyWeightLog[]>([]);
  const [profiles, setProfiles] = useState<ProfileType[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  async function loadConnections() {
    if (!user) return;
    const { data } = await supabase
      .from("connections")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    setConnections(data ?? []);
  }

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadLogs(),
      loadConnections(),
      supabase
        .from("profiles")
        .select("*")
        .order("last_seen", { ascending: false })
        .then(({ data }) => setProfiles(data ?? [])),
    ]).then(() => setLoading(false));
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

  // One row per other person, with whatever connection (if any) links us —
  // in either direction, since a request can come from either side.
  const rows = useMemo(() => {
    if (!user) return [];
    return profiles
      .filter((p) => p.id !== user.id)
      .map((p) => {
        const connection = connections.find(
          (c) =>
            (c.requester_id === user.id && c.addressee_id === p.id) ||
            (c.addressee_id === user.id && c.requester_id === p.id)
        );
        let status: RowStatus = "none";
        if (connection) {
          if (connection.status === "accepted") status = "accepted";
          else if (connection.status === "rejected") status = "rejected";
          else status = connection.requester_id === user.id ? "outgoing_pending" : "incoming_pending";
        }
        return { profile: p, connection, status };
      })
      .sort((a, b) => {
        const priority: Record<RowStatus, number> = {
          incoming_pending: 0,
          accepted: 1,
          outgoing_pending: 2,
          rejected: 3,
          none: 4,
          self: 5,
        };
        return priority[a.status] - priority[b.status];
      });
  }, [profiles, connections, user]);

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setConnectionError(null);
    try {
      await fn();
      await loadConnections();
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  function requestAccess(otherId: string) {
    if (!user) return;
    withBusy(otherId, async () => {
      const { error } = await supabase
        .from("connections")
        .insert({ requester_id: user.id, addressee_id: otherId, status: "pending" });
      if (error) throw error;
    });
  }

  function respond(connectionId: string, status: "accepted" | "rejected") {
    withBusy(connectionId, async () => {
      const { error } = await supabase
        .from("connections")
        .update({ status, responded_at: new Date().toISOString() })
        .eq("id", connectionId);
      if (error) throw error;
    });
  }

  function removeConnection(connectionId: string) {
    withBusy(connectionId, async () => {
      const { error } = await supabase.from("connections").delete().eq("id", connectionId);
      if (error) throw error;
    });
  }

  function requestAgain(connectionId: string, otherId: string) {
    if (!user) return;
    withBusy(connectionId, async () => {
      const { error: deleteError } = await supabase.from("connections").delete().eq("id", connectionId);
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase
        .from("connections")
        .insert({ requester_id: user.id, addressee_id: otherId, status: "pending" });
      if (insertError) throw insertError;
    });
  }

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
          request access below, or accept a request someone sent you.
        </p>
        {connectionError && <p className="error-text">{connectionError}</p>}
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Last seen</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ profile: p, connection, status }) => {
              const busy = busyId === p.id || (connection != null && busyId === connection.id);
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="muted">{relativeTime(p.last_seen)}</td>
                  <td>
                    {status === "none" && (
                      <button type="button" disabled={busy} onClick={() => requestAccess(p.id)}>
                        {busy ? "…" : "Request access"}
                      </button>
                    )}
                    {status === "outgoing_pending" && connection && (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="chip">Pending</span>
                        <button type="button" className="ghost" disabled={busy} onClick={() => removeConnection(connection.id)}>
                          Cancel
                        </button>
                      </div>
                    )}
                    {status === "incoming_pending" && connection && (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="chip focus">Wants access</span>
                        <button type="button" className="primary" disabled={busy} onClick={() => respond(connection.id, "accepted")}>
                          Accept
                        </button>
                        <button type="button" className="ghost" disabled={busy} onClick={() => respond(connection.id, "rejected")}>
                          Reject
                        </button>
                      </div>
                    )}
                    {status === "accepted" && connection && (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="chip focus">Connected</span>
                        <button type="button" className="ghost" disabled={busy} onClick={() => removeConnection(connection.id)}>
                          Remove
                        </button>
                      </div>
                    )}
                    {status === "rejected" && connection && (
                      <div className="row" style={{ gap: 8 }}>
                        <span className="muted">Rejected</span>
                        <button type="button" className="ghost" disabled={busy} onClick={() => requestAgain(connection.id, p.id)}>
                          Request again
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
