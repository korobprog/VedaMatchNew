import type { NotificationMark } from "@vedamatch/shared";
import { taskStatusMarkLabel, taskStatusMarkView } from "@/lib/status-mark";

/**
 * Ярлык состояния задачи (VED-272, VED-312, VED-311).
 *
 * Портальный компонент, а не компонент сервиса: его читают двое — лента
 * уведомлений и карточка в планировщике «Работы», — и ни одного эндпоинта он
 * не знает. Один компонент, а не два похожих, именно потому, что расхождение
 * между лентой и доской и было жалобой (VED-320): состояние обязано выглядеть
 * одинаково там и там, иначе мы своими руками делаем новую путаницу вместо
 * той, которую починили.
 *
 * Внутри рамки только слово: знак рядом с ним заказчик попросил убрать
 * (VED-312), и смысл целиком держит подпись — в чёрно-белом виде и дальтонику
 * ярлык остаётся читаемым. Слова и цвета — в `lib/status-mark.ts`.
 */

export function StatusMarkBadge({
  mark,
}: {
  /** Карточка планировщика передаёт состояние задачи, лента — ещё и
   *  «Комментарий» (VED-298). */
  mark: NotificationMark | null | undefined;
}) {
  const view = taskStatusMarkView(mark);
  if (!view) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${view.className}`}
    >
      {/* Скринридер читает «Статус: Выполнено», глазами видно одно слово:
          вслух «Выполнено» в одиночку не говорит, чьё оно и о чём. */}
      <span className="sr-only">{taskStatusMarkLabel(view)}</span>
      <span aria-hidden="true">{view.label}</span>
    </span>
  );
}
