import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * Строка названия доски: «Назад» слева, название среды посередине, кнопка
 * справа («Оплата», VED-563).
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
      {/* «Назад» (VED-493, было «Все среды») — ступенью вверх, к списку
          сред, а не шагом по истории браузера: из доски, куда пришли по
          ссылке из уведомления или из окна задачи, человек обязан уйти
          наверх, а не обратно в правку. Дальше вверх — «Работа», потом
          главная портала. */}
      <Link
        href="/work/planner"
        title="К списку рабочих сред"
        className="flex items-center gap-1 justify-self-start text-sm text-text-1 hover:text-text-0"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Назад
      </Link>
      <h1 className="min-w-0 text-center font-display text-lg font-bold break-words text-text-0 sm:text-2xl">
        {name}
      </h1>
      <div className="justify-self-end">{end}</div>
    </div>
  );
}
