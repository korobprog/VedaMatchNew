/**
 * Лента уведомлений из портала (VED-330).
 *
 * Те же три ручки, что читает сайт: порция ленты, отметка о прочтении и
 * счётчик непрочитанного. Своих на приложение не заводилось.
 */

import type {
  NotificationInboxResponse,
  NotificationUnreadCountResponse,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';
import { INBOX_PAGE_SIZE } from './inbox-state';

export interface InboxQuery {
  /** Курсор следующей порции из прошлого ответа (VED-267). */
  cursor?: string | null;
  limit?: number;
  /**
   * Поиск по заголовку и тексту (VED-267, `?q`). Серверный, а не отбор по
   * загруженному: тот искал бы только среди пришедших порций и отвечал бы
   * «ничего не нашлось» о том, до чего человек не долистал.
   */
  query?: string | null;
}

/**
 * Строка запроса порции.
 *
 * `limit` называется ВСЕГДА, даже на первой порции: запрос без параметров
 * сервер считает старым клиентом и отдаёт ленту целиком (`isPaginationRequested`
 * в `apps/api/.../inbox-page.ts`) — две сотни карточек разом вместо двадцати.
 *
 * Вынесено отдельной функцией ради теста: собранная строка — единственное,
 * что отличает «просим порцию» от «просим всё», и проверять это через сеть
 * незачем.
 */
export function inboxPath(query: InboxQuery = {}): string {
  const params = new URLSearchParams();
  params.set('limit', `${query.limit ?? INBOX_PAGE_SIZE}`);
  if (query.cursor) params.set('cursor', query.cursor);
  // Пробелы по краям режем здесь, а не на экране: запрос из одних пробелов
  // не поиск, а обычная лента, и гонять его на сервер незачем.
  const search = query.query?.trim();
  if (search) params.set('q', search);
  return `/notifications/inbox?${params.toString()}`;
}

export function createInboxApi(api: ApiClient) {
  return {
    inbox: (query: InboxQuery = {}) =>
      api.request<NotificationInboxResponse>(inboxPath(query)),

    /** Пустой список — «прочитано всё», включая то, до чего не долистали. */
    markRead: (ids?: string[]) =>
      api.request<{ ok: true }>('/notifications/inbox/read', {
        method: 'POST',
        body: ids ? { ids } : {},
      }),

    unreadCount: () =>
      api.request<NotificationUnreadCountResponse>('/notifications/unread-count'),
  };
}

export type InboxApi = ReturnType<typeof createInboxApi>;
