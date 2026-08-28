// Серверный клиент админки Музыки. См. docs/service-module-contract.md.
//
// Отдельно от `music-admin-client-api.ts`: `next/headers` нельзя тянуть в
// модуль, который импортируют клиентские компоненты, — сборка падает.
import { cookies } from "next/headers";
import type {
  MusicAdminAlbumsDto,
  MusicAdminArtistsDto,
  MusicAdminCategoriesDto,
  MusicAdminPlaylistDto,
  MusicAdminSummaryDto,
  MusicModerationItemDto,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * `null` — не авторизован или прав на раздел нет. Молча: страница сама
 * решает, показать пустоту или увести, а разбираться в исключении посреди
 * рендера админки незачем.
 */
async function adminGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    return null;
  }
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const getMusicAdminSummary = () =>
  adminGet<MusicAdminSummaryDto>("/music/admin/summary");

export const getMusicModerationQueue = () =>
  adminGet<MusicModerationItemDto[]>("/music/admin/queue");

export const getMusicAdminArtists = () =>
  adminGet<MusicAdminArtistsDto>("/music/admin/catalog/artists");

export const getMusicAdminAlbums = () =>
  adminGet<MusicAdminAlbumsDto>("/music/admin/catalog/albums");

export const getMusicAdminCategories = () =>
  adminGet<MusicAdminCategoriesDto>("/music/admin/catalog/categories");

/** Подборки портала — те, что витрина показывает всем. */
export const getMusicAdminPlaylists = () =>
  adminGet<MusicAdminPlaylistDto[]>("/music/admin/catalog/playlists");
