"use client";

import { useMusicPlayer } from "./player-provider";
import { MusicPlayGlyph, playButtonLabel } from "./play-glyph";

/**
 * Кнопка запуска на карточке каталога.
 *
 * Отдельным клиентским компонентом, чтобы карточка и страницы вокруг
 * остались серверными: плееру нужен контекст, а всему остальному в каталоге
 * — нет, и тащить целую страницу в браузер ради одного кружка незачем.
 *
 * `queue` — список записей той секции, из которой запустили. Так «дальше»
 * ведёт по тому, что человек видит на экране, а не по одной записи.
 */
export function MusicPlayButton({
  trackId,
  title,
  queue,
  className,
}: {
  trackId: string;
  title: string;
  queue?: string[];
  /**
   * Расположение и размер. По умолчанию — кружок в углу обложки карточки;
   * строке каталога нужен другой, и заводить ради этого вторую такую же
   * кнопку значит развести поведение «текущая запись» по двум местам.
   */
  className?: string;
}) {
  const player = useMusicPlayer();
  const isCurrent = player?.current?.id === trackId;
  const isPlaying = isCurrent && player?.isPlaying;
  // Ожидание — только у той записи, которую включили. Соседние карточки
  // крутиться не должны: грузится одна.
  const state = isCurrent && player?.isLoading
    ? "loading"
    : isPlaying
      ? "playing"
      : "paused";

  return (
    <button
      type="button"
      aria-label={playButtonLabel(state, title)}
      onClick={(event) => {
        // Кнопка лежит поверх ссылки-обложки: без этого клик заодно уводил
        // бы на страницу записи.
        event.preventDefault();
        event.stopPropagation();
        if (isCurrent) player?.toggle();
        else player?.play(trackId, queue);
      }}
      className={
        className ??
        `absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint transition-opacity duration-200 motion-reduce:transition-none ${
          isCurrent
            ? "opacity-100"
            : // На сенсорном экране наведения не бывает: `group-hover` там не
              // наступает никогда, и кнопка запуска была невидима — с
              // телефона плитку нельзя было включить, только открыть. Прячем
              // её только там, где мышь есть.
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
        }`
      }
    >
      <MusicPlayGlyph state={state} />
    </button>
  );
}
