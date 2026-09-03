import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useConnections } from "../hooks/useConnections";
import ConnectionActions from "./ConnectionActions";
import { ROOMS, DEFAULT_ROOM, type RoomId } from "../constants/rooms";
import type { Message, Profile } from "../types/database";

const MAX_HISTORY = 500;

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

// Always mounted (App.tsx renders it once, toggled via CSS) so the message
// history, scroll position, and realtime subscriptions survive opening and
// closing the panel — it behaves like a persistent side widget, not a page.
export default function ChatPanel({ open, onClose }: ChatPanelProps) {
  const { user, onlineUsers } = useAuth();
  const {
    rowFor,
    busyId,
    error: connectionError,
    requestAccess,
    respond,
    removeConnection,
    requestAgain,
  } = useConnections();

  const [messages, setMessages] = useState<Message[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [room, setRoom] = useState<RoomId>(DEFAULT_ROOM);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: msgs }, { data: profiles }] = await Promise.all([
        supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(MAX_HISTORY),
        supabase.from("profiles").select("id, name"),
      ]);
      if (cancelled) return;
      setMessages((msgs ?? []).slice().reverse());
      const nameMap: Record<string, string> = {};
      (profiles as Pick<Profile, "id" | "name">[] | null)?.forEach((p) => (nameMap[p.id] = p.name));
      setNames(nameMap);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel("messages-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const roomMessages = useMemo(() => messages.filter((m) => m.room === room), [messages, room]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [roomMessages.length, open, room]);

  const onlineList = useMemo(
    () => Object.entries(onlineUsers).sort(([, a], [, b]) => a.localeCompare(b)),
    [onlineUsers]
  );

  const activeRow = activePersonId ? rowFor(activePersonId) : null;

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !user) return;
    setSending(true);
    setError(null);
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, body, room });
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDraft("");
  }

  return (
    <>
      {open && <div className="chat-panel-backdrop" onClick={onClose} />}
      <aside className={`chat-panel${open ? " chat-panel-open" : ""}`} aria-hidden={!open}>
        <div className="chat-panel-header">
          <strong>Chat</strong>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        </div>

        <div className="chat-panel-rooms">
          {ROOMS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`chat-room-tab${room === r.id ? " active" : ""}`}
              onClick={() => setRoom(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="chat-panel-online">
          <p className="eyebrow" style={{ margin: "0 0 6px" }}>
            Online now
          </p>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {onlineList.length === 0 && <span className="muted">Just you, for now.</span>}
            {onlineList.map(([id, name]) => (
              <button
                key={id}
                type="button"
                className="chip focus"
                style={{ cursor: id === user?.id ? "default" : "pointer", border: "none" }}
                disabled={id === user?.id}
                onClick={() => setActivePersonId((cur) => (cur === id ? null : id))}
              >
                ● {name}
              </button>
            ))}
          </div>
          {activeRow && (
            <div className="panel" style={{ marginTop: 8, padding: 10 }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{activeRow.profile.name}</strong>
                <button type="button" className="ghost" onClick={() => setActivePersonId(null)}>
                  ✕
                </button>
              </div>
              <ConnectionActions
                row={activeRow}
                busy={busyId === activeRow.profile.id || busyId === activeRow.connection?.id}
                onRequest={requestAccess}
                onAccept={(id) => respond(id, "accepted")}
                onReject={(id) => respond(id, "rejected")}
                onRemove={removeConnection}
                onRequestAgain={requestAgain}
              />
              {connectionError && <p className="error-text">{connectionError}</p>}
            </div>
          )}
        </div>

        <div className="chat-panel-messages">
          {loading && <p className="muted">Loading…</p>}
          {!loading && roomMessages.length === 0 && <p className="muted">No messages yet — say hi.</p>}
          {roomMessages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                {!mine && (
                  <p className="muted" style={{ fontSize: 11, margin: "0 0 2px 4px" }}>
                    {names[m.sender_id] ?? "Someone"}
                  </p>
                )}
                <div
                  style={{
                    background: mine ? "var(--ember)" : "var(--paper)",
                    color: mine ? "#fff" : "var(--ink)",
                    border: mine ? "none" : "1px solid var(--line)",
                    borderRadius: 12,
                    padding: "8px 12px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: 14,
                  }}
                >
                  {m.body}
                </div>
                <p className="muted" style={{ fontSize: 10, margin: "2px 4px 0", textAlign: mine ? "right" : "left" }}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="row" style={{ gap: 8, padding: "10px 14px" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message #${room}…`}
            maxLength={2000}
            style={{ flex: 1 }}
          />
          <button type="submit" className="primary" disabled={sending || !draft.trim()}>
            Send
          </button>
        </form>
        {error && (
          <p className="error-text" style={{ padding: "0 14px 10px" }}>
            {error}
          </p>
        )}
      </aside>
    </>
  );
}
