"use client";

import { Shuffle } from "lucide-react";
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
 * Обе ставят режим «альбом до конца»: «на последнем треке остановиться» —
 * прямое требование карточки, а оставшийся от прошлого прослушивания режим
 * «дальше по альбомам» (VED-132) тихо увёл бы к следующему альбому.
 */
export function MusicPlayModeButtons({
  queue,
  showShuffle = true,
}: {
  queue: string[];
  /**
   * «Перемешать» словами рядом. Странице исполнителя не нужна (VED-530): там
   * перемешивание — значком в строке «Записи», `MusicShuffleIconButton`.
   */
  showShuffle?: boolean;
}) {
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
          player?.setPlayMode("folder");
          setShuffle(false);
          // Один трек — это очередь из него одного: дойдя до конца, плееру
          // просто некуда идти, и он останавливается сам.
          player?.play(first, step === "single" ? [first] : [...queue]);
        }}
        className="inline-flex h-10 items-center rounded-xl border border-glass-brd px-3 text-sm font-medium text-text-1 hover:text-text-0"
      >
        {playStepLabel(step)}
      </button>
      {showShuffle && (
        <button
          type="button"
          onClick={() => playShuffled(player, queue)}
          className="inline-flex h-10 items-center rounded-xl border border-glass-brd px-3 text-sm font-medium text-text-1 hover:text-text-0"
        >
          Перемешать
        </button>
      )}
    </div>
  );
}

type Player = ReturnType<typeof useMusicPlayer>;

/** Вперемешку со случайной записи, режим «альбом до конца». */
function playShuffled(player: Player, queue: string[]) {
  const start = randomTrackId(queue);
  if (!start) return;
  player?.setPlayMode("folder");
  if (!player?.shuffle) player?.toggleShuffle();
  player?.play(start, [...queue]);
}

/**
 * «Перемешать» значком (VED-530) — в строке «Записи» страницы исполнителя.
 * Подпись — в `aria-label` и подсказке.
 */
export function MusicShuffleIconButton({ queue }: { queue: string[] }) {
  const player = useMusicPlayer();
  if (queue.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => playShuffled(player, queue)}
      aria-label="Перемешать"
      title="Перемешать"
      className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-glass-brd text-text-1 hover:text-text-0"
    >
      <Shuffle aria-hidden className="size-4" />
    </button>
  );
}
