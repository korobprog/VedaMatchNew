"use client";

import { useMusicPlayer } from "./player-provider";
import { MusicPlayGlyph, playButtonLabel } from "./play-glyph";
import { isSameQueue } from "./queue-identity";

/**
 * Строка списка, которая запускает запись.
 *
 * Раньше строка целиком была ссылкой на карточку, а запуск прятался в
 * маленьком кружке поверх обложки: человек, выбравший режим «Списком»,
 * попадал на карточку вместо того, чтобы слушать. Теперь наоборот — вся
 * строка запускает, а карточка открывается компактным значком справа.
 *
 * Клиентская обёртка вокруг серверного содержимого: плееру нужен контекст,
 * а обложке с названием — нет. Тот же приём, что у `MusicPlayButton`, чтобы
 * страницы каталога остались серверными.
 */
export function MusicPlayRow({
  trackId,
  title,
  queue,
  glyphClassName,
  className,
  children,
}: {
  trackId: string;
  title: string;
  /** Записи секции: «дальше» ведёт по тому, что человек видит на экране. */
  queue?: string[];
  /** Где нарисовать глиф — поверх обложки, а она сдвинута номером в списке. */
  glyphClassName: string;
  className: string;
  children: React.ReactNode;
}) {
  const player = useMusicPlayer();
  const isCurrent = player?.current?.id === trackId;
  const isPlaying = isCurrent && player?.isPlaying;
  // Ожидание — только у той записи, которую включили: соседние строки
  // крутиться не должны, грузится одна.
  const state =
    isCurrent && player?.isLoading
      ? "loading"
      : isPlaying
        ? "playing"
        : "paused";

  return (
    <button
      type="button"
      aria-label={playButtonLabel(state, title)}
      onClick={() => {
        // Пауза — только когда и запись, и очередь те же. Иначе нажатие
        // означает «играй отсюда»: та же запись в другом списке должна
        // сменить очередь, иначе «дальше» ведёт по прежнему списку.
        if (isCurrent && isSameQueue(player?.queue ?? [], queue))
          player?.toggle();
        else player?.play(trackId, queue);
      }}
      className={className}
    >
      {children}
      {/* Глиф поверх обложки, а не отдельной кнопкой рядом: строка и так
          вся нажимается, а второй элемент управления с тем же действием
          скринридер прочитал бы дважды. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute flex h-10 w-10 items-center justify-center rounded-lg bg-black/45 text-white transition-opacity duration-200 motion-reduce:transition-none ${glyphClassName} ${
          isCurrent
            ? "opacity-100"
            : // На сенсорном экране наведения не бывает, и глиф был бы виден
              // никогда: прячем только там, где мышь есть.
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
        }`}
      >
        <MusicPlayGlyph state={state} />
      </span>
    </button>
  );
}
