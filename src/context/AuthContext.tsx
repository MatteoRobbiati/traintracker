import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { Profile } from "../types/database";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** userId -> name, for everyone currently connected via the presence channel. */
  onlineUsers: Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, string>>({});

  async function loadProfile(userId: string) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile(data ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Heartbeat: touch last_seen on load and then periodically while the tab
  // stays open, so "last seen" in the group view stays fresh.
  useEffect(() => {
    if (!session) return;
    supabase.rpc("touch_last_seen");
    const interval = setInterval(() => {
      supabase.rpc("touch_last_seen");
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session]);

  // Presence: join a single lobby channel so everyone can see who else is
  // online right now. This is Realtime Presence (ephemeral, socket-based) —
  // nothing is written to the database for it.
  const userId = session?.user.id;
  const userName = profile?.name;
  useEffect(() => {
    if (!userId || !userName) return;
    const channel = supabase.channel("presence-lobby", {
      config: { presence: { key: userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ name: string }>();
      const next: Record<string, string> = {};
      for (const key of Object.keys(state)) {
        const first = state[key][0];
        if (first) next[key] = first.name;
      }
      setOnlineUsers(next);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({ name: userName });
    });

    return () => {
      supabase.removeChannel(channel);
      setOnlineUsers({});
    };
  }, [userId, userName]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, name: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        onlineUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
