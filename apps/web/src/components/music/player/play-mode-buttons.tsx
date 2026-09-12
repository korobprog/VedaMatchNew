"use client";

import { useMusicPlayer } from "./player-provider";
import { nextPlayStep, playStepLabel, randomTrackId } from "./play-mode";

/**
 * Две кнопки над списком записей (VED-33): «Перемешать» и многофункциональная
 * «Слушать».
 *
 * Рядом с ними живёт `MusicPlayAllButton` — она про «включи и не думай», с
 * паузой на том же месте. Эти две про выбор порядка, поэтому подписаны словами
 * и стоят второй строкой: человек, которому всё равно, нажимает первую кнопку
 * и не читает эти.
 *
 * Обе снимают повтор: «на последнем треке остановиться» — прямое требование
 * карточки, а включённый повтор тихо гонял бы список по кругу.
 */
export function MusicPlayModeButtons({ queue }: { queue: string[] }) {
  const player = useMusicPlayer();
  if (queue.length === 0) return null;

  const first = queue[0];
  const step = nextPlayStep({
    firstTrackId: first,
    queue: player?.queue ?? [],
    currentId: player?.current?.id ?? null,
  });

  /** Порядок задаёт кнопка, а не то, что осталось от прошлого прослушивания. */
  const setShuffle = (on: boolean) => {
    if (Boolean(player?.shuffle) !== on) player?.toggleShuffle();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          player?.setRepeat("off");
          setShuffle(false);
          // Один трек — это очередь из него одного: дойдя до конца, плееру
          // просто некуда идти, и он останавливается сам.
          player?.play(first, step === "single" ? [first] : [...queue]);
        }}
        className="inline-flex h-10 items-center rounded-xl border border-glass-brd px-3 text-sm font-medium text-text-1 hover:text-text-0"
      >
        {playStepLabel(step)}
      </button>
      <button
        type="button"
        onClick={() => {
          const start = randomTrackId(queue);
          if (!start) return;
          player?.setRepeat("off");
          setShuffle(true);
          player?.play(start, [...queue]);
        }}
        className="inline-flex h-10 items-center rounded-xl border border-glass-brd px-3 text-sm font-medium text-text-1 hover:text-text-0"
      >
        Перемешать
      </button>
    </div>
  );
}
