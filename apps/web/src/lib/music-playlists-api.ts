// Браузерный клиент плейлистов.
//
// Отдельно от `music-api.ts` (там `next/headers`, в клиентский компонент
// такое не втащить) и от `music-playback-api.ts`, где запросы намеренно
// тихие: плеер не должен всплывать ошибкой на чужой странице. Здесь
// наоборот — человек сам нажал «в плейлист», и молчание в ответ на его
// действие хуже сообщения об ошибке.
import type {
  CreateMusicPlaylistRequest,
  MusicPlaylistDto,
  MusicPlaylistPickerDto,
  MusicPlaylistTrackResultDto,
  MyMusicPlaylistsDto,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    // Сообщение от API человеку понятнее «HTTP 403»: там написано, что
    // именно не так — потолок записей, чужая подборка, пустое название.
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      body?.message ?? `Не удалось выполнить запрос (${res.status})`,
    );
  }
  return (await res.json()) as T;
}

/** Свои плейлисты. */
export const getMyPlaylists = () =>
  send<MyMusicPlaylistsDto>("/music/playlists");

/** Список для шторки: те же плейлисты плюс галочка «запись уже внутри». */
export const getPlaylistsForTrack = (trackId: string) =>
  send<MusicPlaylistPickerDto>(
    `/music/playlists?trackId=${encodeURIComponent(trackId)}`,
  );

export const createPlaylist = (body: CreateMusicPlaylistRequest) =>
  send<MusicPlaylistDto>("/music/playlists", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const addTrackToPlaylist = (playlistId: string, trackId: string) =>
  send<MusicPlaylistTrackResultDto>(
    `/music/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
    { method: "POST" },
  );

export const removeTrackFromPlaylist = (playlistId: string, trackId: string) =>
  send<MusicPlaylistTrackResultDto>(
    `/music/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
    { method: "DELETE" },
  );

/** Забрать чужой плейлист себе копией. */
export const copyPlaylistToSelf = (id: string) =>
  send<MusicPlaylistDto>(
    `/music/playlists/${encodeURIComponent(id)}/copy`,
    { method: "POST" },
  );
