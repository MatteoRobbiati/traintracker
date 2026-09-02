import type { ConnectionRow } from "../hooks/useConnections";

interface Props {
  row: ConnectionRow;
  busy: boolean;
  onRequest: (otherId: string) => void;
  onAccept: (connectionId: string) => void;
  onReject: (connectionId: string) => void;
  onRemove: (connectionId: string) => void;
  onRequestAgain: (connectionId: string, otherId: string) => void;
}

/** The status-dependent action row/chip for one other person — reused by
 * the full member list (Profile) and the chat panel's online-people popover. */
export default function ConnectionActions({
  row,
  busy,
  onRequest,
  onAccept,
  onReject,
  onRemove,
  onRequestAgain,
}: Props) {
  const { profile, connection, status } = row;

  if (status === "none") {
    return (
      <button type="button" disabled={busy} onClick={() => onRequest(profile.id)}>
        {busy ? "…" : "Request access"}
      </button>
    );
  }
  if (status === "outgoing_pending" && connection) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <span className="chip">Pending</span>
        <button type="button" className="ghost" disabled={busy} onClick={() => onRemove(connection.id)}>
          Cancel
        </button>
      </div>
    );
  }
  if (status === "incoming_pending" && connection) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <span className="chip focus">Wants access</span>
        <button type="button" className="primary" disabled={busy} onClick={() => onAccept(connection.id)}>
          Accept
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => onReject(connection.id)}>
          Reject
        </button>
      </div>
    );
  }
  if (status === "accepted" && connection) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <span className="chip focus">Connected</span>
        <button type="button" className="ghost" disabled={busy} onClick={() => onRemove(connection.id)}>
          Remove
        </button>
      </div>
    );
  }
  if (status === "rejected" && connection) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <span className="muted">Rejected</span>
        <button type="button" className="ghost" disabled={busy} onClick={() => onRequestAgain(connection.id, profile.id)}>
          Request again
        </button>
      </div>
    );
  }
  return null;
}
