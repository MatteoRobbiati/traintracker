import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(loadThemeMode);
  const [accent, setAccentState] = useState<AccentId>(loadAccent);

  useEffect(() => {
    applyTheme(mode, accent);
  }, [mode, accent]);

  // "System" mode should track the OS setting live, not just at load time --
  // otherwise flipping the OS theme while the tab is open does nothing until
  // a refresh.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(mode, accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode, accent]);

  function setMode(m: ThemeMode) {
    setModeState(m);
    saveThemeMode(m);
  }
  function setAccent(a: AccentId) {
    setAccentState(a);
    saveAccent(a);
  }

  return <ThemeContext.Provider value={{ mode, accent, setMode, setAccent }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
