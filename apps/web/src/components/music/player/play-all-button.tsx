"use client";

import { useMusicPlayer } from "./player-provider";

/**
 * «Слушать» для целого списка — плейлиста, альбома, подборки.
 *
 * Отдельно от `MusicPlayButton`: та кнопка лежит поверх обложки и до
 * наведения невидима, а здесь запуск — главное действие экрана, и прятать
 * его нельзя. Подпись словом, а не один значок: кнопка стоит в заголовке, где
 * рядом нет карточки, объясняющей, что именно заиграет.
 */
export function MusicPlayAllButton({
  queue,
  label = "Слушать",
}: {
  /** Записи по порядку. Пустой список кнопку не рисует. */
  queue: string[];
  label?: string;
}) {
  const player = useMusicPlayer();
  if (queue.length === 0) return null;

  // «Играет» — когда звучит любая запись отсюда: человек нажал «Слушать» и
  // ушёл дальше по списку, и кнопка обязана предлагать паузу, а не начинать
  // всё заново.
  const isFromHere = Boolean(
    player?.current && queue.includes(player.current.id),
  );
  const isPlaying = isFromHere && player?.isPlaying;

  return (
    <button
      type="button"
      onClick={() => {
        if (isFromHere) player?.toggle();
        else player?.play(queue[0], queue);
      }}
      className="btn-mint inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
    >
      {isPlaying ? (
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M7 4l13 8-13 8z" />
        </svg>
      )}
      {isPlaying ? "Пауза" : label}
    </button>
  );
}
