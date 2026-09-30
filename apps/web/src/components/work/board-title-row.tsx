import type { ReactNode } from "react";

/**
 * Строка названия доски: название среды посередине, кнопка справа
 * («Оплата», VED-563).
 *
 * Название — ровно в центре строки (VED-589), а не следом за «Назад»: три
 * колонки `1fr auto 1fr`, крайние равной ширины, поэтому средняя стоит
 * посередине, даже когда справа ничего нет, а «Назад» и кнопка разной
 * ширины. Префикс задач («VED») из строки убран по той же карточке: он и
 * так написан на каждой карточке доски.
 */
export function WorkBoardTitleRow({
  name,
  end,
}: {
  name: string;
  /** Что стоит у правого края строки. */
  end?: ReactNode;
}) {
  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-x-2">
      {/* Левая колонка пустая: «Назад» убран (VED-681) — путь наверх уже
          в крошках над страницей. Колонка держит название по центру. */}
      <span aria-hidden />
      <h1 className="min-w-0 text-center font-display text-lg font-bold break-words text-text-0 sm:text-2xl">
        {name}
      </h1>
      <div className="justify-self-end">{end}</div>
    </div>
  );
}
