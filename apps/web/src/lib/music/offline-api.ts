import type {
  MusicOfflineAllowedRequest,
  MusicOfflineAllowedResponse,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Какие из сохранённых записей портал ещё отдаёт. `null` — не спросили: нет
 * сети или сервер молчит. Именно `null`, а не пустой список: пустой означал
 * бы «всё отозвано», и человек лишился бы музыки ровно в самолёте.
 */
export async function fetchAllowedOfflineIds(
  ids: string[],
): Promise<string[] | null> {
  try {
    const body: MusicOfflineAllowedRequest = { ids };
    const res = await apiFetch(`${API_URL}/music/offline/allowed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as MusicOfflineAllowedResponse;
    return data.ids;
  } catch {
    return null;
  }
}
