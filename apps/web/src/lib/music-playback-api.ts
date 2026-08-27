// Браузерный клиент плеера: состояние, тик и избранное.
//
// Отдельно от `music-client-api.ts` (там загрузка файлов) и от
// `music-api.ts` (там `next/headers`, в клиентский компонент такое не
// втащить). Здесь только то, что зовёт сам плеер, а он живёт в корневом
// layout и работает на любой странице портала.
import type {
  MusicHeartbeatRequest,
  MusicPlaybackStateDto,
  MusicSettingsDto,
  MusicTrackDetailDto,
  UpdateMusicSettingsRequest,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Тихий запрос: ошибки плеера не должны всплывать на чужой странице.
 * Человек читает переписку, а ему сообщают, что не сохранилась позиция, —
 * это шум, а не помощь. `null` означает «не получилось», и решает плеер.
 */
async function quiet<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await apiFetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const getPlaybackState = () =>
  quiet<MusicPlaybackStateDto>("/music/playback/state");

export const sendHeartbeat = (body: MusicHeartbeatRequest) =>
  quiet<{ ok: true; positionSeconds: number }>("/music/playback/heartbeat", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const savePlaybackPosition = (
  trackId: string,
  positionSeconds: number,
) =>
  quiet<MusicPlaybackStateDto>("/music/playback/state", {
    method: "PUT",
    body: JSON.stringify({ trackId, positionSeconds }),
  });

export const stopPlayback = () =>
  quiet<{ ok: true }>("/music/playback/stop", { method: "POST" });

export const getTrack = (id: string) =>
  quiet<MusicTrackDetailDto>(`/music/tracks/${encodeURIComponent(id)}`);

export const getMusicSettings = () =>
  quiet<MusicSettingsDto>("/music/settings");

export const saveMusicSettings = (body: UpdateMusicSettingsRequest) =>
  quiet<MusicSettingsDto>("/music/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const setTrackFavorite = (trackId: string, favorited: boolean) =>
  quiet<{ favorited: boolean }>(
    `/music/favorites/${encodeURIComponent(trackId)}`,
    { method: favorited ? "POST" : "DELETE" },
  );

/**
 * Адрес аудио. Ставится прямо на маршрут, а не на подписанную ссылку:
 * редирект отрабатывает браузер, а срок жизни подписи (шесть часов) нас не
 * касается — при следующем воспроизведении маршрут выдаст новую.
 */
export const trackStreamUrl = (trackId: string) =>
  `${API_URL}/music/tracks/${encodeURIComponent(trackId)}/stream`;
