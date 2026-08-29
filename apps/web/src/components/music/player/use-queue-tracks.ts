"use client";

import { useEffect, useRef, useState } from "react";
import type { MusicTrackDto } from "@vedamatch/shared";
import { getTrack } from "@/lib/music-playback-api";

/**
 * Карточки записей очереди по их идентификаторам.
 *
 * Очередь хранится списком id, а не DTO: полсотни объектов не должны лежать
 * в `localStorage` и ездить в каждом тике. Названия и обложки дочитываются
 * здесь и запоминаются — переоткрытие панели не ходит в сеть за тем же.
 *
 * Кэш живёт в `ref`, а не в состоянии: он нужен, чтобы **не** запрашивать
 * дважды, и держать его в зависимостях эффекта значило бы перезапускать
 * загрузку на каждую догруженную запись.
 *
 * Запросы идут разом, а не по очереди: очередь на полсотни записей при
 * последовательной загрузке заполнялась бы на глазах у человека сверху вниз.
 */
export function useQueueTracks(queue: string[]): {
  tracks: Record<string, MusicTrackDto>;
  /**
   * Записи, которых больше нет. Очередь переживает удаление из каталога — без
   * этой отметки строка висела бы вечным «…».
   */
  missing: Set<string>;
} {
  const [tracks, setTracks] = useState<Record<string, MusicTrackDto>>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const known = useRef(new Set<string>());
  const key = queue.join(",");

  useEffect(() => {
    const wanted = queue.filter((id) => !known.current.has(id));
    if (wanted.length === 0) return;
    // Отмечаем до запроса: иначе повторный проход по тому же списку успел бы
    // отправить второй запрос за той же записью.
    wanted.forEach((id) => known.current.add(id));

    let cancelled = false;
    void Promise.all(
      wanted.map(async (id) => ({ id, track: await getTrack(id) })),
    ).then((results) => {
      if (cancelled) return;

      const found = results.filter((row) => row.track);
      const gone = results.filter((row) => !row.track).map((row) => row.id);

      if (found.length > 0) {
        setTracks((was) => {
          const next = { ...was };
          for (const row of found) next[row.id] = row.track as MusicTrackDto;
          return next;
        });
      }
      if (gone.length > 0) {
        setMissing((was) => {
          const next = new Set(was);
          for (const id of gone) next.add(id);
          // Пропавшую запись помним как «нет», но из `known` не убираем:
          // повторять безнадёжный запрос на каждый рендер незачем.
          return next;
        });
      }
    });

    return () => {
      cancelled = true;
    };
    // Список зависимостей — строка, а не массив: массив новый на каждом
    // рендере, и эффект перезапускался бы вхолостую.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { tracks, missing };
}
