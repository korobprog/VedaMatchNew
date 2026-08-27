// Браузерный клиент админки Музыки: решения по очереди и справочники.
//
// Загрузка файлов живёт не здесь, а в `music-client-api.ts`: заливать может
// любой вошедший, а не только редакция, и админского в ней ничего нет.
import type {
  CreateMusicAlbumRequest,
  CreateMusicArtistRequest,
  CreateMusicCategoryRequest,
  MusicModerationDecisionRequest,
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
