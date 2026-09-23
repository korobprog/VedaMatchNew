/**
 * История уведомлений на клиенте (VED-404).
 *
 * Сервер отдаёт прочитанное в порядке последнего контакта (`contactAt`), а
 * здесь — всё, что с этим списком делает страница: склейка порций, деление
 * по дням контакта, отметка в обе стороны без перестановки под пальцем.
 * Чистыми функциями, без React и без fetch, как `notifications-inbox.ts`.
 */

import type { NotificationItemDto } from "@vedamatch/shared";
import { mergeInboxPages } from "./notifications-inbox";

/** Сколько карточек просить за раз — столько же, сколько у ленты. */
export const HISTORY_PAGE_SIZE = 20;

/**
 * Приклеивает порцию истории. Дубли по `id` отбрасываются: пока человек
 * листает, он открывает уведомления, открытое поднимается наверх истории и
 * приходит со следующей порцией второй раз.
 */
export const mergeHistoryPages = mergeInboxPages;

/**
 * Когда был последний контакт. Сервер для истории всегда шлёт `contactAt`;
 * запасные даты — на случай ответа сборки, которая поля ещё не знала.
 */
export function contactTimeOf(item: NotificationItemDto): string {
  return item.contactAt ?? item.readAt ?? item.createdAt;
}

/** День по местному времени читателя: «сегодня» — это его сегодня. */
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** «Сегодня», «Вчера» или дата словами; год — только если не текущий. */
export function historyDayLabel(date: Date, now = new Date()): string {
  const today = localDayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const key = localDayKey(date);
  if (key === today) return "Сегодня";
  if (key === localDayKey(yesterday)) return "Вчера";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Время контакта внутри дня: «14:05». День уже назван заголовком группы. */
export function historyTimeLabel(item: NotificationItemDto): string {
  return new Date(contactTimeOf(item)).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface HistoryDayGroup {
  /** Ключ дня для React. */
  key: string;
  /** Подпись над группой: «Сегодня», «Вчера», «21 сентября». */
  label: string;
  items: NotificationItemDto[];
}

/**
 * Делит историю по дням контакта, сохраняя порядок сервера.
 *
 * Группа — подряд идущие карточки одного дня: порядок задаёт сервер, и
 * пересортировывать его здесь незачем. Если день встретился снова через
 * другой (так бывает только с карточкой, которую открыли, пока человек
 * листал), он становится своей группой, а не вклеивается в прошлую — иначе
 * карточка прыгнула бы вверх мимо тех, что шли перед ней.
 */
export function groupHistoryByDay(
  items: readonly NotificationItemDto[],
  now = new Date(),
): HistoryDayGroup[] {
  const groups: HistoryDayGroup[] = [];
  for (const item of items) {
    const date = new Date(contactTimeOf(item));
    const day = localDayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key.startsWith(`${day}#`)) {
      last.items.push(item);
      continue;
    }
    groups.push({
      key: `${day}#${groups.length}`,
      label: historyDayLabel(date, now),
      items: [item],
    });
  }
  return groups;
}

/**
 * Кнопка отметки на карточке истории (VED-143), в обе стороны.
 *
 * Карточка остаётся на месте и меняет вид, а не место — то же правило, что в
 * ленте: вернутое в непрочитанные исчезнет из истории при следующем чтении,
 * а не из-под пальца вместе со своей кнопкой отката. Контакт сервер
 * отметит сам, а здесь `contactAt` не трогаем: карточка переехала бы в группу
 * «Сегодня» посреди списка, то есть всё-таки сдвинулась бы.
 */
export function setHistoryItemRead(
  items: readonly NotificationItemDto[],
  id: string,
  read: boolean,
  now = new Date(),
): NotificationItemDto[] {
  const at = now.toISOString();
  return items.map((item) =>
    item.id === id
      ? { ...item, readAt: read ? (item.readAt ?? at) : null }
      : item,
  );
}
