import type { NotificationMark } from "@vedamatch/shared";
import {
  notificationMarkLabel,
  notificationMarkView,
} from "@/lib/notification-mark";

/**
 * Значок состояния задачи в ленте уведомлений (VED-272, VED-312).
 *
 * Доска «Работа» возвращает карточку в ленту на каждой смене статуса, и
 * одинаковые с виду уведомления приходится открывать заново, только чтобы
 * понять, что изменилось. Значок отвечает на этот вопрос, не открывая
 * карточку.
 *
 * Стоит справа снизу — там у карточки пустое место, и значок не спорит ни с
 * заголовком, ни с датой. Внутри рамки только слово: знак рядом с ним
 * заказчик попросил убрать (VED-312), и смысл целиком держит подпись —
 * в чёрно-белом виде и дальтонику значок остаётся читаемым. Слова и цвета —
 * в `lib/notification-mark.ts`.
 */

export function NotificationMarkBadge({
  mark,
}: {
  mark: NotificationMark | null | undefined;
}) {
  const view = notificationMarkView(mark);
  if (!view) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${view.className}`}
    >
      {/* Скринридер читает «Статус: Выполнено», глазами видно одно слово:
          вслух «Выполнено» в одиночку не говорит, чьё оно и о чём. */}
      <span className="sr-only">{notificationMarkLabel(view)}</span>
      <span aria-hidden="true">{view.label}</span>
    </span>
  );
}
