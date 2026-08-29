"use client";

import { useMusicPlayer } from "./player-provider";
import { MusicPlayGlyph, playButtonLabel } from "./play-glyph";

/**
 * «Слушать» на странице записи — главное действие страницы.
 *
 * Его тут не было вовсе: на карточке каталога запуск живёт в углу обложки, а
 * на странице записи не оказалось ничего, кроме «в плейлист», «на устройство»
 * и «выключить через». Соседний `queue-actions.tsx` даже ссылается на
 * «запуск рядом», которого рядом не было. С телефона включить запись,
 * открытую по ссылке, было невозможно.
 *
 * Широкая кнопка с подписью, а не кружок: на плитке кружок опознаётся по
 * месту в углу обложки, а здесь опереться не на что, и треугольник без слова
 * читается как «развернуть».
 */
export function MusicListenButton({
  trackId,
  title,
}: {
  trackId: string;
  title: string;
}) {
  const player = useMusicPlayer();
  if (!player) return null;

  const isCurrent = player.current?.id === trackId;
  const state = isCurrent && player.isLoading
    ? "loading"
    : isCurrent && player.isPlaying
      ? "playing"
      : "paused";

  return (
    <button
      type="button"
      aria-label={playButtonLabel(state, title)}
      onClick={() => {
        if (isCurrent) player.toggle();
        else player.play(trackId);
      }}
      className="btn-mint flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold"
    >
      <MusicPlayGlyph state={state} className="size-4" />
      {state === "loading"
        ? "Загружается…"
        : state === "playing"
          ? "Пауза"
          : "Слушать"}
    </button>
  );
}
