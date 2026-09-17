"use client";

import { useEffect, useRef, useState } from "react";
import type { MusicTrackLyricsDto } from "@vedamatch/shared";
import { getTrack } from "@/lib/music-playback-api";

/**
 * Есть ли что показать в тексте бхаджана — хотя бы одно из трёх полей
 * непустое после обрезки пробелов. Пустая строка и одни пробелы в базе —
 * тот же случай, что и `null`: админ мог сохранить поле пустым, не очистив
 * его до `NULL`, и кнопка не должна появляться ради пустой панели.
 */
export function hasVisibleLyrics(lyrics: MusicTrackLyricsDto | null): boolean {
  if (!lyrics) return false;
  return Boolean(
    lyrics.lyrics?.trim() ||
      lyrics.transliteration?.trim() ||
      lyrics.translation?.trim(),
  );
}

/**
 * Текст бхаджана текущей записи плеера.
 *
 * `MusicTrackDto` очереди и каталога текста не носит — раздувать им `select`
 * во всех местах, что строят карточку записи (каталог, поиск, плейлисты),
 * ради одной кнопки плеера рискованно (план VED-248 в spec.md). Вместо
 * этого при каждой смене записи отдельным запросом читаем `getTrack()` —
 * тем же клиентом, каким уже пользуется `useQueueTracks` для очереди, — и
 * держим кэш по id в `ref`: повторное открытие панели или возврат к уже
 * проигранной записи не бьёт по сети второй раз.
 *
 * Компромисс: запрос уходит на каждую смену записи, а не только по нажатию
 * кнопки, — иначе саму кнопку нечем было бы показать/скрыть корректно
 * (нужно заранее знать, есть ли текст). Явно принятый в плане компромисс,
 * не ошибка.
 */
export function useTrackLyrics(trackId: string | undefined): {
  lyrics: MusicTrackLyricsDto | null;
  loading: boolean;
} {
  const cache = useRef(new Map<string, MusicTrackLyricsDto | null>());
  // Одно состояние «дочитали текст записи X», а не раздельные lyrics/loading:
  // раздельные пришлось бы синхронно сбрасывать в начале эффекта на каждую
  // смену trackId (react-hooks/set-state-in-effect не разрешает setState
  // напрямую в теле эффекта). Готовое для текущего trackId значение
  // выводится при рендере — сравнением `resolved.id` с `trackId`, а не
  // эффектом.
  const [resolved, setResolved] = useState<{
    id: string;
    lyrics: MusicTrackLyricsDto | null;
  } | null>(null);

  useEffect(() => {
    if (!trackId) return;

    let cancelled = false;
    const cached = cache.current.get(trackId);
    // И кэш, и сеть идут через один и тот же `.then` — setState вызывается
    // только там, асинхронно, что для кэша всего на один микротаск позже
    // рендера с новым trackId, а не немедленно в теле эффекта.
    const value = cached !== undefined
      ? Promise.resolve(cached)
      : getTrack(trackId).then((track) => {
          const lyrics = track?.lyrics ?? null;
          cache.current.set(trackId, lyrics);
          return lyrics;
        });

    void value.then((lyrics) => {
      if (!cancelled) setResolved({ id: trackId, lyrics });
    });

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const lyrics = resolved && resolved.id === trackId ? resolved.lyrics : null;
  const loading = Boolean(trackId) && resolved?.id !== trackId;

  return { lyrics, loading };
}
