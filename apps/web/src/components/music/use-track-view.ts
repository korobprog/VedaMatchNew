"use client";

import { useCallback, useEffect, useState } from "react";
import { parseTrackView, type TrackView } from "./track-view";

/**
 * Вид списка записей с памятью в `localStorage` (VED-390).
 *
 * Читаем эффектом, а не ленивым `useState`: на сервере `localStorage` нет,
 * инициализатор вернул бы умолчание, а на клиенте — сохранённое, и это
 * расхождение гидратации. Тем же способом читает своё значение полоса
 * плеера.
 */
export function useTrackView(
  key: string,
  fallback: TrackView,
): [TrackView, (next: TrackView) => void] {
  const [view, setViewState] = useState<TrackView>(fallback);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий
       выше: ленивый useState здесь даёт расхождение гидратации. */
    try {
      setViewState(parseTrackView(window.localStorage.getItem(key), fallback));
    } catch {
      // Приватный режим и запрет хранилища — не повод не работать.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [key, fallback]);

  const setView = useCallback(
    (next: TrackView) => {
      setViewState(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // см. выше
      }
    },
    [key],
  );

  return [view, setView];
}
