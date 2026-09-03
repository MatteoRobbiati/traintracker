import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import {
  type ThemeMode,
  type AccentId,
  loadThemeMode,
  loadAccent,
  saveThemeMode,
  saveAccent,
  applyTheme,
} from "../lib/theme";

interface ThemeContextValue {
  mode: ThemeMode;
  accent: AccentId;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Must be nested inside AuthProvider -- it reads the logged-in profile to
// sync appearance across devices (see the effect below).
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  // localStorage is still the source of truth before login/profile-load
  // finishes (instant-apply on the login/signup pages, no flash), and stays
  // a fallback if a Supabase write ever fails.
  const [mode, setModeState] = useState<ThemeMode>(loadThemeMode);
  const [accent, setAccentState] = useState<AccentId>(loadAccent);
  // Only pull the account's saved preference in once per login -- otherwise
  // a change made right after login, before this effect's dependency
  // settles, could get immediately clobbered back to the stored value.
  const syncedFromProfile = useRef(false);

  useEffect(() => {
    applyTheme(mode, accent);
  }, [mode, accent]);

  // "System" mode should track the OS setting live, not just at load time.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(mode, accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode, accent]);

  // Pull the account's saved theme/accent in once the profile loads, so it
  // follows you across devices and browsers instead of staying stuck in
  // whichever browser's localStorage set it last.
  useEffect(() => {
    if (!profile || syncedFromProfile.current) return;
    syncedFromProfile.current = true;
    if (profile.theme_mode !== mode) setModeState(profile.theme_mode);
    if (profile.accent !== accent) setAccentState(profile.accent);
    // Mirror into localStorage too, so the login/signup pages (no profile
    // loaded yet) apply the right look on the next visit.
    saveThemeMode(profile.theme_mode);
    saveAccent(profile.accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Signing out (or into a different account) should re-arm the sync, so
  // the *next* account's preference gets pulled in rather than whatever the
  // previous session left behind.
  useEffect(() => {
    if (!user) syncedFromProfile.current = false;
  }, [user]);

  function persist(patch: { theme_mode?: ThemeMode; accent?: AccentId }) {
    if (!user) return;
    supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) console.error("Failed to save appearance preference:", error.message);
      });
  }

  function setMode(m: ThemeMode) {
    setModeState(m);
    saveThemeMode(m);
    persist({ theme_mode: m });
  }
  function setAccent(a: AccentId) {
    setAccentState(a);
    saveAccent(a);
    persist({ accent: a });
  }

  return <ThemeContext.Provider value={{ mode, accent, setMode, setAccent }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
