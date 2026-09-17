"use client";

import { useRef, useState } from "react";
import { hasVisibleLyrics, useTrackLyrics } from "./use-track-lyrics";
import { MusicLyricsPanel } from "./lyrics-panel";

/**
 * Кнопка «Текст бхаджана» и всплывающая панель под ней (VED-248), на
 * развёрнутой полосе плеера — рядом с дорожкой (см. расчёт по ширине в
 * комментарии `mini-player.tsx` у строки дорожки).
 *
 * Свой компонент, а не разметка внутри `MiniPlayer`: тестируется в
 * изоляции, как `MusicPlayModeButtons`. Видна, только когда у текущей
 * записи есть текст — `hasVisibleLyrics()` решает по данным
 * `useTrackLyrics()`, которые подтягиваются отдельным запросом при каждой
 * смене записи (в `MusicTrackDto` каталога/очереди текста нет, см.
 * `use-track-lyrics.ts`).
 */
export function MusicLyricsButton({
  trackId,
  className,
}: {
  trackId: string;
  className: string;
}) {
  const { lyrics } = useTrackLyrics(trackId);
  // Открыто хранится как «для какой записи», а не отдельным булевым флагом:
  // на смене trackId сравнение с текущим id само даёт «закрыто», без
  // эффекта, который синхронно сбрасывал бы состояние (см. use-track-lyrics.ts
  // — та же причина). Иначе на следующей записи с текстом панель молча
  // открывалась бы сама собой, унаследовав старое «открыто».
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === trackId;
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  if (!hasVisibleLyrics(lyrics)) return null;

  const close = () => {
    setOpenFor(null);
    // Фокус явно возвращается на кнопку: без этого Tab после закрытия
    // панели улетает в начало страницы, а не остаётся у места, откуда
    // открывали.
    buttonRef.current?.focus();
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Текст бхаджана"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpenFor(open ? null : trackId)}
        className={`${className} ${open ? "text-violet" : "text-text-2"}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M10 11h6M10 15h4" />
        </svg>
      </button>
      {open && lyrics && <MusicLyricsPanel lyrics={lyrics} onClose={close} />}
    </div>
  );
}
