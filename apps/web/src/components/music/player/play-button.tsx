"use client";

import { useMusicPlayer } from "./player-provider";

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

  return (
    <button
      type="button"
      aria-label={isPlaying ? `Пауза: ${title}` : `Слушать: ${title}`}
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
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`
      }
    >
      {isPlaying ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M7 4l13 8-13 8z" />
        </svg>
      )}
    </button>
  );
}
