"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "vedamatch-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs before the first paint so the stored theme is applied without a flash.
 * Keep it in sync with `applyTheme` below.
 */
export const themeInitScript = `(function(){try{var d=document.documentElement;var s=localStorage.getItem("${THEME_STORAGE_KEY}");var p=s==="light"||s==="dark"||s==="system"?s:"system";var r=p==="system"?(window.matchMedia("${DARK_QUERY}").matches?"dark":"light"):p;d.dataset.theme=r;d.dataset.themePreference=p;d.style.colorScheme=r;}catch(e){}})();`;

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  systemTheme: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);
  const resolved = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return;
    const sync = () => setSystemTheme(media.matches ? "dark" : "light");
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    applyTheme(preference, resolved);
  }, [preference, resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing modes can reject storage; the theme still applies.
    }
    startThemeTransition();
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, systemTheme, setPreference }),
    [preference, resolved, systemTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Ignore unreadable storage and fall back to the device preference.
  }
  return "system";
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(preference: ThemePreference, resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", resolved === "dark" ? "#0A0614" : "#FBF9FF");
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

function startThemeTransition(): void {
  const root = document.documentElement;
  root.dataset.themeSwitching = "";
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => delete root.dataset.themeSwitching, 300);
}
