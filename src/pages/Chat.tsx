import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import type { Message, Profile } from "../types/database";

const MAX_HISTORY = 200;

export default function Chat() {
  const { user, onlineUsers } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: msgs }, { data: profiles }] = await Promise.all([
        supabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(MAX_HISTORY),
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const onlineList = useMemo(
    () => Object.entries(onlineUsers).sort(([, a], [, b]) => a.localeCompare(b)),
    [onlineUsers]
  );

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !user) return;
    setSending(true);
    setError(null);
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, body });
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDraft("");
  }

  return (
    <div className="stack" style={{ gap: 12, height: "calc(100vh - 160px)", minHeight: 420 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="eyebrow" style={{ margin: 0 }}>
          Online now
        </span>
        {onlineList.length === 0 && <span className="muted">Just you, for now.</span>}
        {onlineList.map(([id, name]) => (
          <span key={id} className="chip focus">
            ● {name}
            {id === user?.id && " (you)"}
          </span>
        ))}
      </div>

      <div className="panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: 12 }}>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: 8 }}>
          {loading && <p className="muted">Loading…</p>}
          {!loading && messages.length === 0 && <p className="muted">No messages yet — say hi.</p>}
          {messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
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

        <form onSubmit={handleSend} className="row" style={{ marginTop: 8, gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            maxLength={2000}
            style={{ flex: 1 }}
          />
          <button type="submit" className="primary" disabled={sending || !draft.trim()}>
            Send
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
