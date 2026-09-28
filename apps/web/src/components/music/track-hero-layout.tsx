import type { ReactNode } from "react";

/**
 * Верх карточки записи: «Каталог», обложка, столбик кнопок, название с
 * исполнителем и всё остальное.
 *
 * На телефоне столбик кнопок («Линия», «Поделиться», сердце, «Ступени») —
 * правая колонка сетки от строки «Каталог» до названия (VED-605). Раньше он
 * стоял в одном ряду с обложкой, а четыре кнопки по 44px выше широкой
 * обложки: ряд растягивался по столбику, и между картинкой и названием
 * оставалась пустая полоса. Теперь столбик начинается у «Каталога», а
 * название с исполнителем идут сразу под обложкой, слева от кнопок.
 *
 * С `sm` — прежняя раскладка: обложка, столбик кнопок и справа от них
 * текст; `rest` в третьей строке забирает лишнюю высоту, чтобы название не
 * отрывалось от исполнителя, когда обложка выше текста.
 */
export function MusicTrackHeroLayout({
  back,
  cover,
  actions,
  heading,
  rest,
}: {
  back: ReactNode;
  cover: ReactNode;
  actions: ReactNode;
  heading: ReactNode;
  rest: ReactNode;
}) {
  return (
    <div
      data-testid="track-hero"
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[18rem_auto_minmax(0,1fr)] sm:grid-rows-[auto_auto_1fr]"
    >
      <div className="col-start-1 row-start-1 sm:col-span-3">{back}</div>
      <div
        data-testid="track-hero-cover"
        className="col-start-1 row-start-2 mt-2 overflow-hidden rounded-2xl sm:row-span-2 sm:mt-5 sm:self-start"
      >
        {cover}
      </div>
      <div
        data-testid="track-hero-actions"
        className="col-start-2 row-span-3 row-start-1 flex flex-col gap-2 sm:row-span-2 sm:row-start-2 sm:mt-5"
      >
        {actions}
      </div>
      <div
        data-testid="track-hero-heading"
        className="col-start-1 row-start-3 mt-3 flex min-w-0 flex-col gap-2 sm:col-start-3 sm:row-start-2 sm:ml-4 sm:mt-5 sm:gap-3"
      >
        {heading}
      </div>
      <div
        data-testid="track-hero-rest"
        className="col-span-2 col-start-1 row-start-4 mt-3 flex min-w-0 flex-col gap-3 sm:col-span-1 sm:col-start-3 sm:row-start-3 sm:ml-4"
      >
        {rest}
      </div>
    </div>
  );
}
