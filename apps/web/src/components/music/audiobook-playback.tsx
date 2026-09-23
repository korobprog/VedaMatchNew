"use client";

import type { MusicAudiobookResumeDto } from "@vedamatch/shared";
import { useMusicPlayer } from "./player/player-provider";
import { audiobookResumeLabel } from "./audiobook-labels";

/**
 * Кнопки страницы книги (VED-297): продолжить с места или слушать с начала.
 *
 * Книга слушается по порядку и до конца: режим «альбом» и без
 * перемешивания, что бы ни осталось в плеере от прошлого прослушивания.
 * Очередь — все главы, поэтому «дальше» в полосе плеера ведёт в следующую
 * главу, а дослушав последнюю, плеер останавливается сам.
 */
export function MusicAudiobookPlayback({
  queue,
  resume,
}: {
  /** Главы по порядку книги. Пустой список кнопок не рисует. */
  queue: string[];
  resume: MusicAudiobookResumeDto | null;
}) {
  const player = useMusicPlayer();
  if (queue.length === 0) return null;

  const isFromHere = Boolean(
    player?.current && queue.includes(player.current.id),
  );
  const isPlaying = isFromHere && Boolean(player?.isPlaying);

  const start = (trackId: string, from?: number) => {
    player?.setPlayMode("folder");
    if (player?.shuffle) player.toggleShuffle();
    player?.play(trackId, [...queue], from);
  };

  const primaryLabel = isFromHere
    ? isPlaying
      ? "Пауза"
      : "Продолжить"
    : resume
      ? audiobookResumeLabel(resume)
      : "Слушать";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (isFromHere) player?.toggle();
          else if (resume) start(resume.trackId, resume.positionSeconds);
          else start(queue[0]);
        }}
        className="btn-mint inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
      >
        {isPlaying ? (
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 4l13 8-13 8z" />
          </svg>
        )}
        {primaryLabel}
      </button>
      {/* «С начала» нужна, только когда первая кнопка ведёт не к началу:
          продолжение с места или уже играющая книга. */}
      {(resume || isFromHere) && (
        <button
          type="button"
          onClick={() => start(queue[0])}
          className="inline-flex min-h-11 items-center rounded-xl border border-glass-brd px-3 text-sm font-medium text-text-1 hover:text-text-0"
        >
          Слушать с начала
        </button>
      )}
    </div>
  );
}
