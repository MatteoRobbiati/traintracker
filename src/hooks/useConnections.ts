import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import type { Connection, Profile } from "../types/database";

export type ConnectionRowStatus = "accepted" | "incoming_pending" | "outgoing_pending" | "rejected" | "none";

export interface ConnectionRow {
  profile: Profile;
  connection: Connection | null;
  status: ConnectionRowStatus;
}

/**
 * Shared connection-request state/actions, used by the Profile page's full
 * member list and by the chat panel's online-people list. One fetch, one
 * set of mutations, both surfaces render it however fits.
 */
export function useConnections() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("connections")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    setConnections(data ?? []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadConnections(),
      supabase
        .from("profiles")
        .select("*")
        .order("last_seen", { ascending: false })
        .then(({ data }) => setProfiles(data ?? [])),
    ]).then(() => setLoading(false));
  }, [user, loadConnections]);

  const rows = useMemo<ConnectionRow[]>(() => {
    if (!user) return [];
    return profiles
      .filter((p) => p.id !== user.id)
      .map((p) => {
        const connection =
          connections.find(
            (c) =>
              (c.requester_id === user.id && c.addressee_id === p.id) ||
              (c.addressee_id === user.id && c.requester_id === p.id)
          ) ?? null;
        let status: ConnectionRowStatus = "none";
        if (connection) {
          if (connection.status === "accepted") status = "accepted";
          else if (connection.status === "rejected") status = "rejected";
          else status = connection.requester_id === user.id ? "outgoing_pending" : "incoming_pending";
        }
        return { profile: p, connection, status };
      });
  }, [profiles, connections, user]);

  const rowFor = useCallback((otherId: string) => rows.find((r) => r.profile.id === otherId) ?? null, [rows]);

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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

  return { rows, rowFor, loading, error, busyId, requestAccess, respond, removeConnection, requestAgain };
}
