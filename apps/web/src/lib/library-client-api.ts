// Браузерный клиент сервиса Library поверх общего apiFetch.
// Серверные запросы — в library-api.ts (там cookies из next/headers).
import type { LibraryEntryDto } from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Материал целиком, как на его странице (`GET /library/entries/:id`).
 * null — материала нет, он скрыт или сеть подвела: вызывающему достаточно
 * знать, что текста не будет.
 */
export async function fetchLibraryEntry(
  id: string,
): Promise<LibraryEntryDto | null> {
  try {
    const res = await apiFetch(
      `${API_URL}/library/entries/${encodeURIComponent(id)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as LibraryEntryDto;
  } catch {
    return null;
  }
}
