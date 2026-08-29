// API-клиент сервиса «Музыка». См. docs/service-module-contract.md.
//
// Серверный: витрина рисуется на сервере, чтобы обложки и названия попадали
// в разметку сразу, а не после гидратации. Браузерная половина появится
// отдельным файлом (`music-client-api.ts`), когда плеер начнёт слать
// heartbeat, — `next/headers` нельзя тянуть в модуль, который импортируют
// клиентские компоненты.
import { cookies } from "next/headers";
import type {
  MusicAlbumPageDto,
  MusicArtistPageDto,
  MusicCatalogDto,
  MusicHistoryDto,
  MusicPlaybackStateDto,
  MusicPlaylistPageDto,
  MusicTrackDetailDto,
  MusicTrackListDto,
  MusicTrackListQuery,
  MusicSettingsDto,
  MusicTrackDto,
  MusicFriendPlaylistsDto,
  MyMusicPlaylistsDto,
  MyMusicUploadsDto,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Запрос к Музыке. Каталог открыт и гостю, но токен подкладываем, когда он
 * есть: по нему видно свои неопубликованные записи.
 *
 * `null` на 404 и 401 — обычное состояние, а не сбой: страница исполнителя
 * по чужой ссылке и гость на карточке черновика приходят сюда постоянно.
 * Остальные коды поднимаются исключением: упавший API не должен выглядеть
 * как пустой каталог.
 */
async function musicGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function getMusicCatalog(): Promise<MusicCatalogDto | null> {
  return musicGet<MusicCatalogDto>("/music/catalog");
}

/** Свои плейлисты — для рельса, каталога и страницы списка. */
export function getMyMusicPlaylists(): Promise<MyMusicPlaylistsDto | null> {
  return musicGet<MyMusicPlaylistsDto>("/music/playlists");
}

/**
 * Плейлисты тех, кто открыл мне доступ. `null` — гость.
 *
 * Серверный запрос, а не браузерный: список рисуется сразу с именами и
 * обложками, без прыжка после гидратации.
 */
export function getFriendMusicPlaylists(): Promise<MusicFriendPlaylistsDto | null> {
  return musicGet<MusicFriendPlaylistsDto>("/music/playlists/friends");
}

/** Страница плейлиста. `null` — чужой закрытый или несуществующий. */
export function getMusicPlaylist(
  id: string,
): Promise<MusicPlaylistPageDto | null> {
  return musicGet<MusicPlaylistPageDto>(`/music/playlists/${id}`);
}

/** История прослушиваний, свежие сверху. */
export function getMusicHistory(): Promise<MusicHistoryDto | null> {
  return musicGet<MusicHistoryDto>("/music/listens");
}

/**
 * Собирает строку запроса из фильтров. Пустые и `undefined` не попадают в
 * адрес: `?category=&artist=` в ссылке чипа выглядит как поломка, а сервер
 * всё равно считает их отсутствием фильтра.
 */
export function musicTrackQueryString(query: MusicTrackListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function getMusicTracks(
  query: MusicTrackListQuery = {},
): Promise<MusicTrackListDto | null> {
  return musicGet<MusicTrackListDto>(
    `/music/tracks${musicTrackQueryString(query)}`,
  );
}

export function getMusicTrack(id: string): Promise<MusicTrackDetailDto | null> {
  return musicGet<MusicTrackDetailDto>(`/music/tracks/${encodeURIComponent(id)}`);
}

export function getMusicArtist(
  slug: string,
): Promise<MusicArtistPageDto | null> {
  return musicGet<MusicArtistPageDto>(
    `/music/artists/${encodeURIComponent(slug)}`,
  );
}

export function getMusicAlbum(slug: string): Promise<MusicAlbumPageDto | null> {
  return musicGet<MusicAlbumPageDto>(
    `/music/albums/${encodeURIComponent(slug)}`,
  );
}

/** Свои записи со статусом и решением редакции. `null` — гость. */
export function getMyMusicUploads(): Promise<MyMusicUploadsDto | null> {
  return musicGet<MyMusicUploadsDto>("/music/uploads/mine");
}

/** Своё избранное. `null` — гость. */
export function getMyMusicFavorites(): Promise<{ items: MusicTrackDto[] } | null> {
  return musicGet<{ items: MusicTrackDto[] }>("/music/favorites");
}

/** Настройки прослушивания. `null` — гость. */
export function getMusicSettingsServer(): Promise<MusicSettingsDto | null> {
  return musicGet<MusicSettingsDto>("/music/settings");
}

/**
 * Состояние плеера для серверной отрисовки. Нужно карточке «Продолжить» на
 * главной портала: она должна попасть в разметку сразу, а не появиться
 * после гидратации — иначе главная дёргается на каждом входе.
 *
 * `null` — гость или слушать пока нечего.
 */
export function getMusicPlaybackStateServer(): Promise<MusicPlaybackStateDto | null> {
  return musicGet<MusicPlaybackStateDto>("/music/playback/state");
}
