import { Check, FlaskConical, Play, Undo2 } from "lucide-react";
import type { NotificationMark } from "@vedamatch/shared";
import {
  notificationMarkLabel,
  notificationMarkView,
} from "@/lib/notification-mark";

/**
 * Значок состояния задачи в ленте уведомлений (VED-272).
 *
 * Доска «Работа» возвращает карточку в ленту на каждой смене статуса, и
 * одинаковые с виду уведомления приходится открывать заново, только чтобы
 * понять, что изменилось. Значок отвечает на этот вопрос, не открывая
 * карточку.
 *
 * Стоит справа снизу — там у карточки пустое место, и значок не спорит ни с
 * заголовком, ни с датой. Цвет, слово и знак идут вместе: цвет различает
 * значки беглым взглядом, но смысл несут слово и знак, поэтому в чёрно-белом
 * виде и дальтонику значок остаётся читаемым. Слова и цвета — в
 * `lib/notification-mark.ts`.
 */

const ICONS = {
  play: Play,
  flask: FlaskConical,
  check: Check,
  undo: Undo2,
} as const;

export function NotificationMarkBadge({
  mark,
}: {
  mark: NotificationMark | null | undefined;
}) {
  const view = notificationMarkView(mark);
  if (!view) return null;
  const Icon = ICONS[view.icon];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${view.className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {/* Скринридер читает «Статус: Выполнено», глазами видно одно слово:
          вслух «Выполнено» в одиночку не говорит, чьё оно и о чём. */}
      <span className="sr-only">{notificationMarkLabel(view)}</span>
      <span aria-hidden="true">{view.label}</span>
    </span>
  );
}
