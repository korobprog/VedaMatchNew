"use client";

import { useEffect, useRef } from "react";
import type { MusicTrackLyricsDto } from "@vedamatch/shared";
import { MusicTrackLyrics } from "@/components/music/music-track-lyrics";

/**
 * Текст бхаджана текущей записи — всплывающая панель над полосой плеера, по
 * образцу `MusicQueuePanel`: тот же фокус на закрытии при открытии, тот же
 * `Escape`, та же рамка `player-bar`. Вёрстку текста не дублирует — внутри
 * тот же `MusicTrackLyrics`, что и на странице записи (со своим `headingId`,
 * иначе в DOM задваивается `id="music-lyrics"`, когда слушаешь запись прямо
 * на её собственной странице).
 *
 * Позиционируется НЕ от кнопки-триггера (она стоит в середине третьей
 * строки полосы, см. `mini-player.tsx`), а от самой полосы плеера
 * (`<section className="player-bar">` в `mini-player.tsx` — ближайший
 * реально позиционированный предок благодаря `relative` на нём же): кнопка
 * даёт лишь ~40px ширины контекста, и `right-0` от неё утаскивал панель на
 * ~48px за левый край экрана на 360-390px (найдено ревью VED-248, круг 1).
 * На мобильном — `inset-x-3`, симметричные отступы от краёв самой полосы
 * (совпадает с шириной её внутреннего ряда, физически не может вылезти за
 * экран); с `sm` — компактная ширина у правого края полосы, как и раньше.
 */
export function MusicLyricsPanel({
  lyrics,
  onClose,
}: {
  lyrics: MusicTrackLyricsDto;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Фокус переходит в панель: иначе Tab уводит по странице под ней, и
  // закрыть её с клавиатуры не получится.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Текст бхаджана"
      // Мобильный якорь — `inset-x-3` от полосы плеера (не от кнопки):
      // 12px с обеих сторон её собственных краёв, а полоса сама никогда не
      // выходит за экран (mini-player.tsx: `mx-auto max-w-5xl` внутри
      // `fixed inset-x-0 px-3`) — значит и панель не может. С `sm` — обратно
      // компактная, у правого края полосы, ширина по месту, но не шире
      // 26rem (текст бхаджана длиннее названия записи, у очереди уже).
      className="player-bar pointer-events-auto absolute inset-x-3 bottom-full mb-2 max-h-[60vh] overflow-y-auto rounded-2xl p-4 sm:inset-x-auto sm:right-3 sm:w-[min(26rem,calc(100vw-1.5rem))]"
    >
      <div className="flex items-center justify-end">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Закрыть текст"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <MusicTrackLyrics lyrics={lyrics} headingId="music-lyrics-player" compact />
    </div>
  );
}
