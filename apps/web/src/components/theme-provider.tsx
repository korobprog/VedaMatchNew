"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DARK_QUERY,
  isThemePreference,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

export {
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
};

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  systemTheme: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialPreference,
}: {
  children: React.ReactNode;
  /** Preference resolved from the cookie on the server, kept identical for the first client render to avoid hydration mismatches. */
  initialPreference?: ThemePreference;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    initialPreference ?? "system",
  );
  // Системную тему читаем сразу при первом клиентском рендере, а не в
  // эффекте: иначе первый applyTheme ставил бы data-theme="dark" и у
  // «системных» светлых пользователей на кадр мигала тёмная тема. На сервере
  // matchMedia нет — там остаётся "dark", как и раньше (в разметку это не
  // попадает: для system сервер data-theme не ставит).
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    readSystemTheme(),
  );
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
    // Переносим выбор старых посетителей из localStorage в cookie: если cookie
    // ещё нет (сервер отдал дефолт), но в localStorage лежит старое значение,
    // подхватываем его уже после гидратации, чтобы не спорить с разметкой сервера.
    if (document.cookie.includes(`${THEME_COOKIE_NAME}=`)) return;
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemePreference(stored)) setPreferenceState(stored);
    } catch {
      // Private browsing modes can reject storage; the theme still applies.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyTheme(preference, resolved);
    // Переносим выбор старых посетителей из localStorage в cookie, чтобы
    // следующий заход сервер отрисовал уже в нужной теме.
    writeThemeCookie(preference);
  }, [preference, resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing modes can reject storage; the theme still applies.
    }
    writeThemeCookie(next);
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

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function writeThemeCookie(preference: ThemePreference): void {
  document.cookie = `${THEME_COOKIE_NAME}=${preference}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
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
