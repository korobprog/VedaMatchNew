"use client";

import { useState } from "react";
import { useMusicPlayer } from "./player-provider";

/**
 * «Слушать дальше» и «В конец очереди» на странице записи.
 *
 * Два действия, которых плану не хватало с этапа 3: очередь можно было
 * только смотреть. Кнопки живут здесь, а не на плитке каталога, — на плитке
 * уже есть запуск и сердце, а третья и четвёртая кнопки в углу обложки
 * превращают её в панель управления.
 *
 * Пока ничего не играет, кнопок нет: «дальше» относительно тишины ничего не
 * значит, а запуск на этот случай уже есть рядом.
 */
export function MusicQueueActions({ trackId }: { trackId: string }) {
  const player = useMusicPlayer();
  const [done, setDone] = useState<"next" | "last" | null>(null);

  if (!player?.current) return null;
  // Себя же в очередь второй раз не предлагаем.
  if (player.current.id === trackId) return null;

  const button =
    "inline-flex h-9 items-center gap-1.5 rounded-xl border border-glass-brd px-3 text-xs font-semibold text-text-1 transition-colors hover:text-text-0";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          player.playNext(trackId);
          setDone("next");
        }}
        className={button}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 6h11M3 12h8M3 18h8M17 12v8M13 16h8" />
        </svg>
        Слушать дальше
      </button>

      <button
        type="button"
        onClick={() => {
          player.addToQueue(trackId);
          setDone("last");
        }}
        className={button}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 6h13M3 12h13M3 18h7M17 15v6M14 18h6" />
        </svg>
        В конец очереди
      </button>

      {/* Очередь не видна с этой страницы, поэтому о результате говорим
          словами: иначе нажатие выглядит как ничего не сделавшее. */}
      <span aria-live="polite" className="text-xs text-text-2">
        {done === "next"
          ? "Поставлено следующей"
          : done === "last"
            ? "Добавлено в конец"
            : ""}
      </span>
    </div>
  );
}
