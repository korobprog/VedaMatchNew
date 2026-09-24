import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaApi } from './media-api';
import { describeMediaError } from './media-errors';
import type { MediaTrack } from './media-parse';
import { mediaFilterKey, type MediaFilter } from './media-query';

/**
 * Выдача Медиатеки порциями (VED-331) — четыре состояния по правилу
 * `expo-data-fetching`: первая загрузка (`tracks === null` без ошибки),
 * ошибка первой загрузки, пусто, содержимое. Ошибка обновления или
 * продолжения содержимое не гасит.
 *
 * Смена фильтра перезагружает список, и засчитывается только ответ на
 * последний фильтр: человек быстро щёлкает вкладки, и ответ на прошлую
 * вкладку не должен лечь поверх текущей.
 */
export function useMediaTracks(api: MediaApi, filter: MediaFilter, enabled: boolean) {
  const [tracks, setTracks] = useState<MediaTrack[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const key = mediaFilterKey(filter);

  const load = useCallback(
    async (keepContent: boolean) => {
      const id = (request.current += 1);
      if (!keepContent) {
        setTracks(null);
        setLoadError(null);
      }
      setMoreError(null);
      try {
        const page = await api.tracks(filterRef.current, null);
        if (request.current !== id) return;
        setTracks(page.items);
        setCursor(page.nextCursor);
        setLoadError(null);
      } catch (error) {
        if (request.current === id) setLoadError(describeMediaError(error, 'Не удалось загрузить Медиатеку.'));
      } finally {
        if (request.current === id) setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (enabled) void load(false);
  }, [enabled, key, load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || !tracks) return;
    const id = request.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.tracks(filterRef.current, cursor);
      if (request.current !== id) return;
      setTracks((current) => {
        const seen = new Set((current ?? []).map((track) => track.id));
        return [...(current ?? []), ...page.items.filter((track) => !seen.has(track.id))];
      });
      setCursor(page.nextCursor);
    } catch (error) {
      if (request.current === id) setMoreError(describeMediaError(error, 'Не удалось загрузить продолжение.'));
    } finally {
      if (request.current === id) setLoadingMore(false);
    }
  }, [api, cursor, loadingMore, tracks]);

  return {
    tracks,
    hasMore: cursor !== null,
    loadError,
    moreError,
    refreshing,
    loadingMore,
    retry: () => void load(false),
    refresh,
    loadMore,
  };
}
