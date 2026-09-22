/**
 * Состояние ленты уведомлений в приложении (VED-330).
 *
 * Чистая часть экрана `app/notifications.tsx`: склейка порций, отметка о
 * прочтении и разбивка на секции. Экран поверх неё только рисует и ходит в
 * сеть — так правила проверяются тестом, а не телефоном.
 *
 * Сервер отдаёт ленту порциями (VED-267, `apps/api/.../inbox-page.ts`):
 * сначала весь поток непрочитанного, следом весь поток прочитанного, внутри
 * каждого — свежее сверху. Этот порядок здесь сохраняется как есть: он
 * пришёл из базы и пересортировке на клиенте не подлежит — иначе «показать
 * ещё» будет дописывать строки не туда, куда указывал курсор.
 */

import type { NotificationItemDto } from '@vedamatch/shared';

/** Размер порции — тот же, что у сервера по умолчанию. Называем его всегда:
 *  молчание означает «отдай ленту целиком», и она придёт целиком. */
export const INBOX_PAGE_SIZE = 20;

/**
 * Дописать пришедшую порцию к уже показанному.
 *
 * Дубли возможны и это не ошибка сервера: уведомление, прочитанное уже
 * после того, как человек прошёл мимо него в потоке непрочитанного,
 * встретится второй раз в потоке прочитанного (keyset, см. `inbox-page.ts`).
 * Выигрывает уже показанная строка: у неё на экране может стоять свежая
 * отметка о прочтении, которую серверная копия ещё не знает.
 */
export function mergeInboxPages(
  current: readonly NotificationItemDto[],
  next: readonly NotificationItemDto[],
): NotificationItemDto[] {
  const seen = new Set(current.map((item) => item.id));
  const added = next.filter((item) => !seen.has(item.id));
  return added.length > 0 ? [...current, ...added] : [...current];
}

/** Отметить одно прочитанным. Уже прочитанное не трогаем: у него своя дата. */
export function markItemRead(
  items: readonly NotificationItemDto[],
  id: string,
  at: Date,
): NotificationItemDto[] {
  return items.map((item) =>
    item.id === id && item.readAt === null ? { ...item, readAt: at.toISOString() } : item,
  );
}

/** Отметить прочитанным всё показанное. */
export function markAllItemsRead(
  items: readonly NotificationItemDto[],
  at: Date,
): NotificationItemDto[] {
  const iso = at.toISOString();
  return items.map((item) => (item.readAt === null ? { ...item, readAt: iso } : item));
}

/** Сколько непрочитанного среди показанного. Счётчик колокольчика берётся не
 *  отсюда, а из ответа сервера: там всё непрочитанное, а не одна порция. */
export function countUnreadItems(items: readonly NotificationItemDto[]): number {
  return items.reduce((total, item) => (item.readAt === null ? total + 1 : total), 0);
}

/** Секция списка: заголовок и её уведомления. */
export interface InboxSection {
  /** Ключ для `SectionList`: заголовок повторяется у разных лет. */
  key: string;
  title: string;
  /** Непрочитанная секция: её заголовок несёт счётчик и кнопку «прочитать всё». */
  unread: boolean;
  data: NotificationItemDto[];
}

/** Заголовок секции «Новое». */
export const UNREAD_SECTION_TITLE = 'Новое';

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** Календарный день строкой `2026-09-22` — по нему строки и группируются. */
function dayKeyOf(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Подпись дня: «Сегодня», «Вчера» или дата. Год добавляется только к чужому
 * году — «12 сентября 2025», но просто «12 сентября» для текущего.
 *
 * Считается по календарю (`dayKeyOf`), а не вычитанием суток: в полночь
 * разница в 23 часа — это «вчера», а в 25 часов может быть «позавчера».
 */
export function dayTitle(date: Date, now: Date): string {
  const today = dayKeyOf(now);
  if (dayKeyOf(date) === today) return 'Сегодня';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKeyOf(date) === dayKeyOf(yesterday)) return 'Вчера';
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/**
 * Разбивка ленты на секции.
 *
 * Непрочитанное — одной секцией «Новое», без разбивки по дням: это список
 * дел, а не хроника, и дробить пять карточек на три даты значило бы прятать
 * их друг от друга. Прочитанное — по дням: там человек уже ищет «что было
 * во вторник».
 *
 * Пустые секции не создаются: заголовок без строк выглядит как потерянный
 * список.
 */
export function buildInboxSections(
  items: readonly NotificationItemDto[],
  now: Date,
): InboxSection[] {
  const unread = items.filter((item) => item.readAt === null);
  const sections: InboxSection[] = [];
  if (unread.length > 0) {
    sections.push({ key: 'unread', title: UNREAD_SECTION_TITLE, unread: true, data: [...unread] });
  }

  let current: InboxSection | null = null;
  for (const item of items) {
    if (item.readAt !== null) {
      const date = new Date(item.createdAt);
      // Дата не разобралась (сервер такого не шлёт, но строка есть строка) —
      // строку не теряем, кладём в отдельную секцию без даты.
      const key = Number.isNaN(date.getTime()) ? 'read-unknown' : `read-${dayKeyOf(date)}`;
      if (!current || current.key !== key) {
        current = {
          key,
          title: Number.isNaN(date.getTime()) ? 'Ранее' : dayTitle(date, now),
          unread: false,
          data: [],
        };
        sections.push(current);
      }
      current.data.push(item);
    }
  }

  return sections;
}

/**
 * Время под заголовком карточки. Относительное в первые сутки — «12 мин
 * назад» человек читает быстрее, чем «22:14», — дальше дата.
 */
export function formatWhen(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  // Часы телефона могут отстать от серверных: «через 3 минуты» на карточке
  // выглядит поломкой, а «только что» — нет.
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} ч назад`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Счётчик на колокольчике. Больше 99 не показываем — не помещается и не
 *  меняет смысла. */
export function badgeLabel(unreadCount: number): string | null {
  if (unreadCount <= 0) return null;
  return unreadCount > 99 ? '99+' : `${unreadCount}`;
}
