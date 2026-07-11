import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

/* ════════════════════════════════════════════════════════════════════
   WEALBEE — THEME MANAGER
   ─────────────────────────────────────────────────────────────────────
   Architecture:
     ThemeId  →  string union (scalable: add a new ID = add one theme block)
     CSS vars →  single source of truth in theme.css  [data-theme="..."]
     JS Theme →  thin mirror of CSS vars (backward compat for inline styles)
     Default  →  always "light" unless the user (or the landing pages) chose
                 otherwise — no OS-preference auto-switching
     Linked   →  landing/login pages (src/pages/landing/wb/app/use-theme.ts)
                 read/write the same localStorage key, so the choice carries
                 across the login boundary in both directions
     FOUC     →  prevented by inline <script> in index.html (runs before paint)
   ════════════════════════════════════════════════════════════════════ */


/* ── 1. Theme Registry ───────────────────────────────────────────── */

/** Add a new ID here + one [data-theme] block in theme.css = new theme done. */
export type ThemeId = "light" | "dark" | "midnight";

const VALID_THEMES = new Set<ThemeId>(["light", "dark", "midnight"]);
const STORAGE_KEY  = "wealbee-theme";

/** JS theme values mirror CSS vars so existing inline-style components still
 *  receive a typed object. Future components should read CSS vars directly. */
export type Theme = {
  bg: string; bgCard: string; bgCardHover: string;
  bgMuted: string; bgAccent: string; bgAccentStrong: string; bgAccentActive: string;
  border: string; borderStrong: string;
  fg: string; fgMuted: string; fgSubtle: string; fgDisabled: string;
  brand: string; brandDeep: string; brandFg: string;
  sidebarBg: string; hubBg: string;
  topBarBg: string; topBarBorder: string;
  inputBg: string; inputBorder: string;
};

const THEMES: Record<ThemeId, Theme> = {
  light: {
    bg: "#F5F5F7",              bgCard: "#FFFFFF",          bgCardHover: "#E8F0FE",
    bgMuted: "#F5F5F7",         bgAccent: "rgba(8,73,172,0.06)",
    bgAccentStrong: "rgba(8,73,172,0.08)",                  bgAccentActive: "#E8F0FE",
    border: "rgba(8,73,172,0.12)",                          borderStrong: "rgba(8,73,172,0.20)",
    fg: "#1A1A2E",              fgMuted: "#3D3D52",
    fgSubtle: "#3D3D52",                        fgDisabled: "rgba(26,26,46,0.30)",
    brand: "#0849AC",           brandDeep: "#0849AC",       brandFg: "#FFFFFF",
    sidebarBg: "#FFFFFF",       hubBg: "#FFFFFF",
    topBarBg: "#F5F5F7",        topBarBorder: "rgba(8,73,172,0.10)",
    inputBg: "#F5F5F7",         inputBorder: "rgba(8,73,172,0.14)",
  },
  dark: {
    bg: "#0B0D18",              bgCard: "#131824",          bgCardHover: "#1a2438",
    bgMuted: "#0f1220",         bgAccent: "rgba(77,143,232,0.12)",
    bgAccentStrong: "rgba(77,143,232,0.18)",                bgAccentActive: "rgba(77,143,232,0.25)",
    border: "rgba(255,255,255,0.07)",                       borderStrong: "rgba(255,255,255,0.13)",
    fg: "rgba(240,242,255,0.95)",                           fgMuted: "rgba(240,242,255,0.85)",
    fgSubtle: "rgba(240,242,255,0.70)",                     fgDisabled: "rgba(240,242,255,0.40)",
    brand: "#4D8FE8",           brandDeep: "#1e3a6e",       brandFg: "#FFFFFF",
    sidebarBg: "#0D1117",       hubBg: "#131824",
    topBarBg: "rgba(11,13,24,0.96)",                        topBarBorder: "rgba(255,255,255,0.07)",
    inputBg: "rgba(255,255,255,0.06)",                      inputBorder: "rgba(255,255,255,0.10)",
  },
  midnight: {
    bg: "#000000",              bgCard: "#0A0A0F",          bgCardHover: "#111118",
    bgMuted: "#050508",         bgAccent: "rgba(139,156,248,0.10)",
    bgAccentStrong: "rgba(139,156,248,0.16)",               bgAccentActive: "rgba(139,156,248,0.22)",
    border: "rgba(255,255,255,0.05)",                       borderStrong: "rgba(255,255,255,0.09)",
    fg: "rgba(220,220,255,0.95)",                           fgMuted: "rgba(220,220,255,0.85)",
    fgSubtle: "rgba(220,220,255,0.68)",                     fgDisabled: "rgba(220,220,255,0.38)",
    brand: "#8B9CF8",           brandDeep: "#1a1a4e",       brandFg: "#000000",
    sidebarBg: "#05050A",       hubBg: "#0A0A0F",
    topBarBg: "rgba(0,0,0,0.92)",                           topBarBorder: "rgba(255,255,255,0.05)",
    inputBg: "rgba(255,255,255,0.04)",                      inputBorder: "rgba(255,255,255,0.07)",
  },
};

/** Convenience re-exports for legacy import sites */
export const lightTheme = THEMES.light;
export const darkTheme  = THEMES.dark;


/* ── 2. Storage + OS helpers ─────────────────────────────────────── */

function readStorage(): ThemeId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && VALID_THEMES.has(v as ThemeId) ? (v as ThemeId) : null;
  } catch { return null; }
}

function writeStorage(id: ThemeId): void {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage blocked */ }
}

/** Reads what the FOUC script already applied so React state is in sync from
 *  the very first render — no flicker between server/JS-applied values.
 *  Default is always light (no OS-preference following) — same rule as the
 *  landing/login pages (src/pages/landing/wb/app/use-theme.ts), and both
 *  read/write the same STORAGE_KEY so the choice carries across login. */
function resolveInitialTheme(): ThemeId {
  const fromAttr = document.documentElement.getAttribute("data-theme") as ThemeId;
  if (VALID_THEMES.has(fromAttr)) return fromAttr;
  return readStorage() ?? "light";
}

/** Applies theme to <html> — the single DOM mutation that drives all CSS vars. */
function applyToDOM(id: ThemeId): void {
  document.documentElement.setAttribute("data-theme", id);
}


/* ── 3. Context contract ─────────────────────────────────────────── */

interface ThemeContextValue {
  themeId:     ThemeId;
  theme:       Theme;
  isDark:      boolean;          // true for any non-light theme (backward compat)
  setTheme:    (id: ThemeId) => void;
  toggleDark:  () => void;       // backward compat: cycles light ↔ dark
  setDark:     (v: boolean) => void; // backward compat
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: "light", theme: THEMES.light, isDark: false,
  setTheme: () => {}, toggleDark: () => {}, setDark: () => {},
});


/* ── 4. Provider ─────────────────────────────────────────────────── */

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(resolveInitialTheme);

  /** Central setter — DOM + state + storage in one call. */
  const setTheme = useCallback((id: ThemeId) => {
    applyToDOM(id);
    setThemeId(id);
    writeStorage(id);
  }, []);

  /** Sync DOM on first mount (no-op if FOUC script already matched). */
  useEffect(() => { applyToDOM(themeId); }, []);

  /** Pick up a theme change made on the landing/login pages (same STORAGE_KEY)
   *  when the app was already open in another tab — keeps both sides linked. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue || !VALID_THEMES.has(e.newValue as ThemeId)) return;
      applyToDOM(e.newValue as ThemeId);
      setThemeId(e.newValue as ThemeId);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isDark     = themeId !== "light";
  const toggleDark = useCallback(() => setTheme(isDark ? "light" : "dark"), [isDark, setTheme]);
  const setDark    = useCallback((v: boolean) => setTheme(v ? "dark" : "light"), [setTheme]);

  return (
    <ThemeContext.Provider value={{
      themeId, theme: THEMES[themeId], isDark,
      setTheme, toggleDark, setDark,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}


/* ── 5. Hook ─────────────────────────────────────────────────────── */

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
