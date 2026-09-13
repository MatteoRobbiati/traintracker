// Appearance settings: a light/dark mode plus an accent color, both
// per-device (localStorage, not synced through Supabase -- there's no
// reason two people sharing an account concept would want the same look).
//
// The base "paper/ink" palette (background, text, borders) stays purely
// CSS-driven via the `data-theme` attribute (see index.css) -- that part
// was already wired for dark mode via prefers-color-scheme, it just never
// had a UI to force it either way. The accent (brand color used for
// buttons/badges/highlights) is applied here by writing CSS variables
// directly, rather than a `data-accent` x `data-theme` CSS matrix, so
// adding a new accent is one object entry instead of several new rule
// blocks.
//
// NOTE: `index.html` carries a plain-JS duplicate of ACCENT_PALETTES (in its
// pre-React init script, to avoid a flash of the wrong colors before this
// module loads) -- keep the two in sync if a palette value changes here.

export type ThemeMode = "system" | "light" | "dark";
export type AccentId = "ember" | "ocean" | "forest" | "grape" | "rose";

export interface AccentInfo {
  id: AccentId;
  label: string;
  swatch: string; // for the picker UI, light-mode "ember" value
}

export const ACCENTS: AccentInfo[] = [
  { id: "ember", label: "Ember", swatch: "#D9531E" },
  { id: "ocean", label: "Ocean", swatch: "#1D6FE0" },
  { id: "forest", label: "Forest", swatch: "#2F7D42" },
  { id: "grape", label: "Grape", swatch: "#7A3FC9" },
  { id: "rose", label: "Rose", swatch: "#C13566" },
];

interface AccentPalette {
  ember: string;
  emberMuted: string;
  focus: string;
}

const ACCENT_PALETTES: Record<AccentId, { light: AccentPalette; dark: AccentPalette }> = {
  ember: {
    light: { ember: "#D9531E", emberMuted: "#EEC0A4", focus: "#1E6E62" },
    dark: { ember: "#FF6C39", emberMuted: "#5A392C", focus: "#4FBDA8" },
  },
  ocean: {
    light: { ember: "#1D6FE0", emberMuted: "#BBD6F7", focus: "#0E9488" },
    dark: { ember: "#5B9DFF", emberMuted: "#1E3A5C", focus: "#37C9B8" },
  },
  forest: {
    light: { ember: "#2F7D42", emberMuted: "#BFE3C5", focus: "#B5541E" },
    dark: { ember: "#4FCE6B", emberMuted: "#234A2E", focus: "#E08A4A" },
  },
  grape: {
    light: { ember: "#7A3FC9", emberMuted: "#DCC9F5", focus: "#C2622A" },
    dark: { ember: "#B98CF0", emberMuted: "#3B2A55", focus: "#E08A4A" },
  },
  rose: {
    light: { ember: "#C13566", emberMuted: "#F2C4D6", focus: "#2E7D6B" },
    dark: { ember: "#F06B99", emberMuted: "#4A2333", focus: "#4FBDA8" },
  },
};

const THEME_KEY = "traintrack:theme";
const ACCENT_KEY = "traintrack:accent";

export function loadThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private browsing / storage disabled -- fall through to default */
  }
  return "system";
}

export function loadAccent(): AccentId {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    if (v && v in ACCENT_PALETTES) return v as AccentId;
  } catch {
    /* ignore */
  }
  return "ember";
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function saveAccent(accent: AccentId): void {
  try {
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    /* ignore */
  }
}

export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/**
 * The ember/ember-muted pair for a *specific* accent, independent of the
 * current viewer's own theme -- for rendering something in someone else's
 * chosen color (e.g. a connection's activity calendar on their profile)
 * without touching the page's actual --ember CSS variables.
 */
export function accentColors(accent: AccentId, isDark: boolean): { ember: string; emberMuted: string } {
  const palette = ACCENT_PALETTES[accent][isDark ? "dark" : "light"];
  return { ember: palette.ember, emberMuted: palette.emberMuted };
}

export function applyTheme(mode: ThemeMode, accent: AccentId): void {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);

  const palette = ACCENT_PALETTES[accent][resolveIsDark(mode) ? "dark" : "light"];
  root.style.setProperty("--ember", palette.ember);
  root.style.setProperty("--ember-muted", palette.emberMuted);
  root.style.setProperty("--focus", palette.focus);
}
