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

/**
 * То же в обе стороны (VED-143): `read: false` возвращает уведомление в
 * непрочитанные.
 *
 * Отдельно от `markItemRead`, а не вместо него: у «открыл по ссылке» и у
 * «нажал кнопку на карточке» разные правила (см. `openInboxItem` и
 * `toggleInboxRead` ниже), и общее имя на двоих скрыло бы эту разницу.
 */
export function setItemRead(
  items: readonly NotificationItemDto[],
  id: string,
  read: boolean,
  now = new Date(),
): NotificationItemDto[] {
  const iso = read ? now.toISOString() : null;
  return items.map((item) => {
    if (item.id !== id) return item;
    // Дату прочтения у уже прочитанного не переставляем — как и сервер.
    if ((item.readAt !== null) === read) return item;
    return { ...item, readAt: iso };
  });
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

/** Группа списка: «Новое» сверху и «Прочитанное» под ним. */
export type InboxGroup = "unread" | "read";

/**
 * Карточки, которые остаются в своей группе, что бы ни стало с их `readAt`
 * (VED-143). Ключ — `id`, значение — группа, в которой карточка была в момент
 * нажатия.
 *
 * Зачем удержание. Нажать «прочитано» на третьей карточке сверху — и по
 * правилу VED-153 она обязана уехать в «Прочитанное», куда-то вниз за экран.
 * Всё, что было под ней, прыгает на её место под самым пальцем, а кнопка
 * отката уезжает туда, где её уже не найти: человек не может проверить, что
 * нажал, и не может исправить промах. Поэтому карточка остаётся там, где на
 * неё нажали, и меняет вид, а не место. Порядок при этом не нарушен — он
 * применится при следующем чтении ленты с сервера, и удержания там уже не
 * будет.
 *
 * Пустая карта — обычное состояние ленты: удержание появляется только от
 * нажатия кнопки на карточке и живёт до перечитывания ленты.
 */
export type InboxHolds = ReadonlyMap<string, InboxGroup>;

/** В какой группе показывается карточка: удержание важнее её `readAt`. */
export function inboxGroupOf(
  item: NotificationItemDto,
  holds: InboxHolds = new Map(),
): InboxGroup {
  return holds.get(item.id) ?? (item.readAt === null ? "unread" : "read");
}

/**
 * Две группы списка. Порядок внутри каждой — тот, в котором пришло с сервера
 * (`inbox-order.ts`): пересортировывать порции на клиенте нельзя, иначе
 * подгруженное встанет не туда, куда его поставил курсор.
 */
export function splitInbox(
  items: readonly NotificationItemDto[],
  holds: InboxHolds = new Map(),
): {
  unread: NotificationItemDto[];
  read: NotificationItemDto[];
} {
  return {
    unread: items.filter((item) => inboxGroupOf(item, holds) === "unread"),
    read: items.filter((item) => inboxGroupOf(item, holds) === "read"),
  };
}

/**
 * Лента целиком: показанные карточки, удержания и счётчик непрочитанного.
 *
 * Тремя отдельными состояниями React их держать нельзя: нажатие на кнопку
 * меняет все три разом, а кнопка ещё и откатывается, если сервер не ответил.
 * Разъехавшись хоть на одну отрисовку, они показали бы «Новое · 5» над шестью
 * новыми карточками.
 *
 * `unreadTotal` — всё непрочитанное человека, а не то, что попало в порцию:
 * это число носит на себе колокольчик. Считает его сервер.
 */
export interface InboxFeedState {
  items: NotificationItemDto[];
  holds: InboxHolds;
  unreadTotal: number;
}

/** Первая порция: лента начинается заново, удержаний в ней ещё нет. */
export function inboxFeedFromPage(page: {
  items: NotificationItemDto[];
  unreadCount: number;
}): InboxFeedState {
  return { items: [...page.items], holds: new Map(), unreadTotal: page.unreadCount };
}

/**
 * Продолжение ленты (VED-267). Удержания переживают подгрузку: они про
 * карточки, которые уже на экране, а «Показать ещё» дописывает в хвост и
 * ничего не переставляет.
 */
export function appendInboxPage(
  state: InboxFeedState,
  page: { items: NotificationItemDto[]; unreadCount: number },
): InboxFeedState {
  return {
    items: mergeInboxPages(state.items, page.items),
    holds: state.holds,
    unreadTotal: page.unreadCount,
  };
}

/**
 * Человек открыл уведомление по ссылке.
 *
 * Удержания тут нет намеренно: переход уводит со страницы, прыжка списка никто
 * не увидит, а вернувшись, человек вправе застать своё прочитанное там, где
 * ему полагается быть по VED-153.
 */
export function openInboxItem(
  state: InboxFeedState,
  id: string,
  now = new Date(),
): InboxFeedState {
  const item = state.items.find((row) => row.id === id);
  if (!item || item.readAt !== null) return state;
  return {
    items: setItemRead(state.items, id, true, now),
    holds: state.holds,
    unreadTotal: Math.max(0, state.unreadTotal - 1),
  };
}

/** «Отметить все прочитанными»: гасит показанное и счётчик целиком. */
export function markInboxAllRead(
  state: InboxFeedState,
  now = new Date(),
): InboxFeedState {
  return {
    items: markAllItemsRead(state.items, now),
    holds: state.holds,
    unreadTotal: 0,
  };
}

/**
 * Нажатие кнопки на карточке (VED-143). Возвращает и новое состояние, и то,
 * изменилось ли что-нибудь: повторное нажатие на ту же сторону не должно
 * ни дёргать сервер, ни трогать счётчик.
 *
 * Счётчик двигается на единицу, а не пересчитывается по загруженному:
 * `unreadTotal` считает всю ленту человека, включая то, до чего он не
 * долистал. Точное число приходит следом в ответе сервера.
 */
export function toggleInboxRead(
  state: InboxFeedState,
  id: string,
  read: boolean,
  now = new Date(),
): { state: InboxFeedState; changed: boolean } {
  const item = state.items.find((row) => row.id === id);
  if (!item || (item.readAt !== null) === read)
    return { state, changed: false };

  // Группу запоминаем до изменения: удержать надо там, где карточка стоит
  // сейчас, у человека под пальцем.
  const holds = new Map(state.holds);
  holds.set(id, inboxGroupOf(item, state.holds));

  return {
    state: {
      items: setItemRead(state.items, id, read, now),
      holds,
      unreadTotal: read
        ? Math.max(0, state.unreadTotal - 1)
        : state.unreadTotal + 1,
    },
    changed: true,
  };
}

/**
 * Счётчик по свежему числу от сервера. Отдельной функцией, потому что ответ
 * приходит позже нажатия: к этому моменту человек мог нажать ещё раз, и
 * переписывать `items` ответом на прошлое нажатие нельзя — только число.
 */
export function withUnreadTotal(
  state: InboxFeedState,
  unreadTotal: number,
): InboxFeedState {
  return state.unreadTotal === unreadTotal
    ? state
    : { ...state, unreadTotal };
}
