import { useConnections } from "../hooks/useConnections";
import ConnectionActions from "../components/ConnectionActions";
import { relativeTime } from "../lib/format";

const STATUS_PRIORITY = {
  incoming_pending: 0,
  accepted: 1,
  outgoing_pending: 2,
  rejected: 3,
  none: 4,
} as const;

export default function Connections() {
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

  const sortedRows = [...rows].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  const incomingCount = rows.filter((r) => r.status === "incoming_pending").length;

  return (
    <div>
      <h1>Connections</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Everyone's name is visible, but workouts and body weight stay private until you two connect —
        request access below, or accept a request someone sent you. You can also do this from the chat
        panel's online list.
      </p>

      {incomingCount > 0 && (
        <p className="chip focus" style={{ marginBottom: 12 }}>
          {incomingCount} pending request{incomingCount === 1 ? "" : "s"} waiting on you
        </p>
      )}

      <div className="panel">
        {connectionError && <p className="error-text">{connectionError}</p>}
        {connectionsLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="table-scroll">
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
          </div>
        )}
      </div>
    </div>
  );
}
