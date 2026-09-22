/**
 * Состояние ленты уведомлений на клиенте (VED-267).
 *
 * Лента приходит порциями, а показывается одним списком, и весь пересчёт
 * этого списка — сложение порций, отметки о прочтении, разбивка на «новое» и
 * «прочитанное» — живёт здесь: чистыми функциями, без React и без fetch.
 */

import type { NotificationItemDto } from "@vedamatch/shared";

/**
 * Сколько карточек в порции просит веб.
 *
 * Размер называет клиент, и называет всегда: API отдаёт ленту порциями только
 * тому, кто об этом попросил, а молчащему (установленному приложению, которое
 * про постраничность не знает) — целиком, как раньше. Значение своё, а не
 * серверное по умолчанию: это решение о том, сколько карточек рисовать на
 * экране, и принимает его тот, кто рисует.
 */
export const INBOX_PAGE_SIZE = 20;

/**
 * Приклеивает новую порцию к уже показанному.
 *
 * Дубли по `id` отбрасываются, и это не перестраховка. Пока человек листает,
 * он открывает уведомления, и прочитанное переезжает из первого потока ленты
 * во второй — за курсором, который уже прошёл мимо. Такая строка приходит
 * второй раз, и без этой проверки React получил бы два элемента с одним
 * ключом. Побеждает первое вхождение: оно уже на экране, и его состояние
 * (открыли ли его только что) свежее серверного.
 */
export function mergeInboxPages(
  current: readonly NotificationItemDto[],
  incoming: readonly NotificationItemDto[],
): NotificationItemDto[] {
  const seen = new Set(current.map((item) => item.id));
  const added = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return added.length > 0 ? [...current, ...added] : [...current];
}

/**
 * Отмечает одно уведомление прочитанным прямо в списке.
 *
 * Не ждём сервер: переход по ссылке уводит со страницы, и ответ пришёл бы уже
 * некуда. Уже прочитанное не трогаем — иначе отметка сдвинулась бы на время
 * повторного клика.
 */
export function markItemRead(
  items: readonly NotificationItemDto[],
  id: string,
  now = new Date(),
): NotificationItemDto[] {
  return items.map((item) =>
    item.id === id && item.readAt === null
      ? { ...item, readAt: now.toISOString() }
      : item,
  );
}

/** То же для всей загруженной ленты — кнопка «отметить все прочитанными». */
export function markAllItemsRead(
  items: readonly NotificationItemDto[],
  now = new Date(),
): NotificationItemDto[] {
  const iso = now.toISOString();
  return items.map((item) =>
    item.readAt === null ? { ...item, readAt: iso } : item,
  );
}

/** Сколько непрочитанного осталось на экране. */
export function countUnreadItems(
  items: readonly NotificationItemDto[],
): number {
  return items.filter((item) => item.readAt === null).length;
}

/**
 * Две группы списка. Порядок внутри каждой — тот, в котором пришло с сервера
 * (`inbox-order.ts`): пересортировывать порции на клиенте нельзя, иначе
 * подгруженное встанет не туда, куда его поставил курсор.
 */
export function splitInbox(items: readonly NotificationItemDto[]): {
  unread: NotificationItemDto[];
  read: NotificationItemDto[];
} {
  return {
    unread: items.filter((item) => item.readAt === null),
    read: items.filter((item) => item.readAt !== null),
  };
}
