// Браузерный клиент админки Музыки: решения по очереди и справочники.
//
// Загрузка файлов живёт не здесь, а в `music-client-api.ts`: заливать может
// любой вошедший, а не только редакция, и админского в ней ничего нет.
import type {
  CreateMusicAlbumRequest,
  CreateMusicArtistRequest,
  CreateMusicCategoryRequest,
  CreateMusicPlaylistRequest,
  MusicModerationDecisionRequest,
  MusicReportDecisionRequest,
  UpdateMusicAlbumRequest,
  UpdateMusicArtistRequest,
  UpdateMusicCategoryRequest,
  UpdateMusicPlaylistRequest,
  UpdateMusicTrackRequest,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    // Сообщение от API человеку понятнее «HTTP 400»: там написано, что
    // именно не так с файлом или формой.
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? `Не удалось выполнить запрос (${res.status})`);
  }
  return (await res.json()) as T;
}

export const decideMusicTrack = (
  trackId: string,
  body: MusicModerationDecisionRequest,
) =>
  send<unknown>(`/music/admin/queue/${trackId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateMusicTrack = (id: string, body: UpdateMusicTrackRequest) =>
  send<unknown>(`/music/admin/catalog/tracks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

/**
 * Удаление записи вместе с файлом. Не то же самое, что «скрыть» из очереди
 * решений: скрытая запись остаётся в каталоге и занимает место, а сюда
 * доходит то, чему в каталоге не место совсем.
 */
export const deleteMusicTrack = (id: string) =>
  send<{ ok: true }>(`/music/admin/catalog/tracks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const createMusicArtist = (body: CreateMusicArtistRequest) =>
  send<unknown>("/music/admin/catalog/artists", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const createMusicAlbum = (body: CreateMusicAlbumRequest) =>
  send<unknown>("/music/admin/catalog/albums", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const createMusicCategory = (body: CreateMusicCategoryRequest) =>
  send<unknown>("/music/admin/catalog/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });

// ---------- Правка и удаление справочников ----------
//
// API умел это с самого начала (`PATCH` у всех трёх, `DELETE` у раздела), но
// клиент звал только `create*` — опечатку в имени исполнителя нельзя было
// исправить ничем, кроме запроса в базу.

export const updateMusicArtist = (id: string, body: UpdateMusicArtistRequest) =>
  send<unknown>(`/music/admin/catalog/artists/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteMusicArtist = (id: string) =>
  send<unknown>(`/music/admin/catalog/artists/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const updateMusicAlbum = (id: string, body: UpdateMusicAlbumRequest) =>
  send<unknown>(`/music/admin/catalog/albums/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteMusicAlbum = (id: string) =>
  send<unknown>(`/music/admin/catalog/albums/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const updateMusicCategory = (
  id: string,
  body: UpdateMusicCategoryRequest,
) =>
  send<unknown>(`/music/admin/catalog/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteMusicCategory = (id: string) =>
  send<unknown>(`/music/admin/catalog/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

/** Решение по жалобе. Закрывает все открытые жалобы на эту запись. */
export const decideMusicReport = (
  id: string,
  body: MusicReportDecisionRequest,
) =>
  send<{ ok: true }>(`/music/admin/reports/${id}/decide`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ---------- Подборки портала ----------

export const createMusicSystemPlaylist = (body: CreateMusicPlaylistRequest) =>
  send<{ id: string }>("/music/admin/catalog/playlists", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateMusicSystemPlaylist = (
  id: string,
  body: UpdateMusicPlaylistRequest,
) =>
  send<unknown>(`/music/admin/catalog/playlists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteMusicSystemPlaylist = (id: string) =>
  send<unknown>(`/music/admin/catalog/playlists/${id}`, { method: "DELETE" });

export const addTrackToMusicSystemPlaylist = (id: string, trackId: string) =>
  send<unknown>(`/music/admin/catalog/playlists/${id}/tracks/${trackId}`, {
    method: "POST",
  });

export const removeTrackFromMusicSystemPlaylist = (
  id: string,
  trackId: string,
) =>
  send<unknown>(`/music/admin/catalog/playlists/${id}/tracks/${trackId}`, {
    method: "DELETE",
  });
