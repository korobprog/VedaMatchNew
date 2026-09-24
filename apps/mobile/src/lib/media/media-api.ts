import type { ApiClient } from '@/lib/api/client';
import {
  parseMediaAudiobookPage,
  parseMediaAudiobooks,
  parseMediaCatalog,
  parseMediaStreamUrl,
  parseMediaTrackPage,
  type MediaAudiobook,
  type MediaAudiobookPage,
  type MediaCatalog,
  type MediaStreamUrl,
  type MediaTrackPage,
} from './media-parse';
import { mediaTracksPath, type MediaFilter } from './media-query';

/**
 * Клиент Медиатеки (VED-331) — ручки сайта, нового серверного кода нет:
 * `AuthGuard` и `OptionalAuthGuard` принимают `Authorization: Bearer`
 * наравне с cookie. Звук отдаётся не потоком через API, а подписанной
 * ссылкой S3 (`stream-url`) — перемотку и докачку делает бакет.
 */
export interface MediaApi {
  catalog(root: string | null): Promise<MediaCatalog>;
  tracks(filter: MediaFilter, cursor: string | null): Promise<MediaTrackPage>;
  audiobooks(): Promise<MediaAudiobook[]>;
  audiobook(slug: string): Promise<MediaAudiobookPage | null>;
  streamUrl(trackId: string): Promise<MediaStreamUrl>;
  /** Тик «слушает»: история, счётчик прослушиваний и позиция, как у сайта. */
  heartbeat(body: { trackId: string; positionSeconds: number; listenedSeconds: number }): Promise<void>;
  /** Пауза: «слушает сейчас» у друзей снимается сразу. */
  stopListening(): Promise<void>;
}

export function createMediaApi(api: ApiClient): MediaApi {
  return {
    catalog: async (root) => {
      const query = root ? `?root=${encodeURIComponent(root)}` : '';
      return parseMediaCatalog(await api.request<unknown>(`/music/catalog${query}`));
    },
    tracks: async (filter, cursor) => parseMediaTrackPage(await api.request<unknown>(mediaTracksPath(filter, cursor))),
    audiobooks: async () => parseMediaAudiobooks(await api.request<unknown>('/music/audiobooks')),
    audiobook: async (slug) =>
      parseMediaAudiobookPage(await api.request<unknown>(`/music/audiobooks/${encodeURIComponent(slug)}`)),
    streamUrl: async (trackId) =>
      parseMediaStreamUrl(await api.request<unknown>(`/music/tracks/${encodeURIComponent(trackId)}/stream-url`)),
    heartbeat: async ({ trackId, positionSeconds, listenedSeconds }) => {
      await api.request('/music/playback/heartbeat', {
        method: 'POST',
        // Приватного сеанса в приложении нет (этап 1): видимость «слушает»
        // для друзей решает настройка Музыки на сервере, как и у сайта.
        body: { trackId, positionSeconds, listenedSeconds, isPrivateSession: false },
      });
    },
    stopListening: async () => {
      await api.request('/music/playback/stop', { method: 'POST' });
    },
  };
}
