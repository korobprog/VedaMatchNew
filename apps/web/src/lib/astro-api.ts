// API-клиент сервиса Astro. См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type {
  AstroAdminUsageDto,
  AstroReadingsDto,
  AstroSettingsDto,
  AstroStateDto,
  AstroTodayDto,
  VedicChart,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Server-side запрос к Astro API с access_token из cookie. null — не авторизован.
 *
 * `emptyOn404` включается там, где отсутствие данных — обычное состояние, а не сбой.
 * Проверка именно по коду ответа, а не через перехват любого исключения: иначе
 * упавший API молча выглядел бы как незаполненная анкета.
 */
async function astroGet<T>(
  path: string,
  options: { emptyOn404?: boolean } = {},
): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (res.status === 404 && options.emptyOn404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const getAstroState = () => astroGet<AstroStateDto>("/astro/birth-data");

/** Карта. null — данные рождения ещё не заполнены. */
export const getAstroChart = () =>
  astroGet<VedicChart>("/astro/chart", { emptyOn404: true });

/** Разборы: готовые тексты из кэша плюс состояние квоты. */
export const getAstroReadings = () =>
  astroGet<AstroReadingsDto>("/astro/readings", { emptyOn404: true });

/** Персональный день. null — нет точного времени и места рождения. */
export const getAstroToday = () =>
  astroGet<AstroTodayDto>("/astro/today", { emptyOn404: true });

/** Лимиты сервиса. Только для роли admin — иначе API ответит 403. */
export const getAdminAstroSettings = () =>
  astroGet<AstroSettingsDto>("/admin/astro/settings");

export const getAdminAstroUsage = (days = 30) =>
  astroGet<AstroAdminUsageDto>(`/admin/astro/usage?days=${days}`);
