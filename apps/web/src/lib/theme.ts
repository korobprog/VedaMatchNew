// Общее для сервера и клиента: layout читает cookie, провайдер её пишет.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "vedamatch-theme";
export const THEME_COOKIE_NAME = "vedamatch-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
