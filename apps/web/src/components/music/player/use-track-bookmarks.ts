"use client";

import { useCallback, useRef, useState } from "react";
import type { MusicBookmarkDto } from "@vedamatch/shared";
import {
  createBookmark,
  deleteBookmark,
  getBookmarks,
  renameBookmark,
} from "@/lib/music-playback-api";
import { upsertBookmark } from "./player-marks";

/**
 * Метки играющей записи (VED-388).
 *
 * Список читается лениво — когда человек открыл вкладку «Метки», а не на
 * каждой смене записи: большинство слушает, не заглядывая в метки, и лишний
 * запрос на каждый переход по очереди незачем. Быстрая кнопка «Метка» на
 * полосе ставит метку и без прочитанного списка; если список уже есть,
 * новая метка встаёт в него на своё место.
 *
 * Список хранится вместе с записью, к которой относится: на смене записи
 * сравнение идентификаторов само даёт «не загружено», без эффекта, который
 * сбрасывал бы состояние (тот же приём, что в `use-track-lyrics.ts`).
 */
export function useTrackBookmarks(trackId: string | null) {
  const [state, setState] = useState<{
    trackId: string;
    items: MusicBookmarkDto[] | null;
    failed: boolean;
  } | null>(null);
  const loadingFor = useRef<string | null>(null);

  const mine = state && state.trackId === trackId ? state : null;

  const load = useCallback(() => {
    if (!trackId || loadingFor.current === trackId) return;
    loadingFor.current = trackId;
    void getBookmarks(trackId).then((result) => {
      loadingFor.current = null;
      setState({
        trackId,
        items: result ? result.items : null,
        failed: !result,
      });
    });
  }, [trackId]);

  const apply = useCallback(
    (forTrack: string, change: (items: MusicBookmarkDto[]) => MusicBookmarkDto[]) => {
      setState((was) =>
        was && was.trackId === forTrack && was.items
          ? { ...was, items: change(was.items) }
          : was,
      );
    },
    [],
  );

  const add = useCallback(
    async (positionSeconds: number, label?: string | null) => {
      if (!trackId) return null;
      const created = await createBookmark({ trackId, positionSeconds, label });
      if (created) apply(trackId, (items) => upsertBookmark(items, created));
      return created;
    },
    [trackId, apply],
  );

  const rename = useCallback(
    async (id: string, label: string | null) => {
      if (!trackId) return null;
      const updated = await renameBookmark(id, label);
      if (updated) apply(trackId, (items) => upsertBookmark(items, updated));
      return updated;
    },
    [trackId, apply],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!trackId) return false;
      const done = await deleteBookmark(id);
      if (done) apply(trackId, (items) => items.filter((row) => row.id !== id));
      return Boolean(done);
    },
    [trackId, apply],
  );

  return {
    /** `null` — ещё не читали (или читаем). */
    items: mine?.items ?? null,
    failed: mine?.failed ?? false,
    load,
    add,
    rename,
    remove,
  };
}

export type TrackBookmarks = ReturnType<typeof useTrackBookmarks>;
