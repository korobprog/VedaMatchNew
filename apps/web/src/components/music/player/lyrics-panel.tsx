"use client";

import { useEffect, useRef } from "react";
import type { MusicTrackLyricsDto } from "@vedamatch/shared";
import { MusicTrackLyrics } from "@/components/music/music-track-lyrics";

/**
 * Текст бхаджана текущей записи — всплывающая панель над полосой плеера, по
 * образцу `MusicQueuePanel`: тот же фокус на закрытии при открытии, тот же
 * `Escape`, та же рамка `player-bar`. Вёрстку текста не дублирует — внутри
 * тот же `MusicTrackLyrics`, что и на странице записи.
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
      // Шире, чем у очереди: строки текста и перевода длиннее названий
      // записей. Ширина всё равно по месту (`calc(100vw - 1.5rem)`), а не
      // жёсткая: на 360-390px панель не должна уезжать за край экрана.
      className="player-bar pointer-events-auto absolute bottom-full right-0 mb-2 max-h-[60vh] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-4"
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
      <MusicTrackLyrics lyrics={lyrics} />
    </div>
  );
}
