/**
 * Куда ведёт уведомление (VED-330).
 *
 * Один разбор на два источника: путь сайта приходит и в `data.url` пуша
 * (`lib/push/push-url.ts`), и в поле `url` карточки ленты
 * (`NotificationItemDto.url`). Формулирует их один и тот же
 * `notification-copy.ts` на сервере, поэтому и разбирать их двумя разными
 * таблицами нельзя: разойдутся молча, и разойдутся именно там, где человек
 * этого не увидит — в пуше.
 *
 * Модуль чистый: ни `expo-router`, ни браузера здесь нет. Навигацию делает
 * экран, а сюда приходит строка и уходит решение.
 */

/** Раздел портала, на который показывает уведомление. */
export type NotificationTarget =
  /** Беседа — единственное, куда приложение вело и раньше. */
  | { kind: 'chat'; conversationId: string }
  /** Запросы на переписку: нативный экран `chat/requests`. */
  | { kind: 'chat-requests' }
  /** Профиль человека: нативный экран `people/[id]`. */
  | { kind: 'person'; userId: string }
  /** Община: нативный экран `communities/[id]`. */
  | { kind: 'community'; communityId: string }
  /** Справочник людей целиком — вкладка «Люди». */
  | { kind: 'people' }
  /** Сама лента уведомлений. */
  | { kind: 'inbox' }
  /**
   * Обращение в поддержку: нативный экран `support/[id]` (VED-336). Без id —
   * список «Мои обращения». Ответ поддержки приходит пушем
   * `support.ticket.replied` с путём `/support/<id>`.
   */
  | { kind: 'support'; ticketId: string | null }
  /**
   * «Здоровье» (VED-384): решение по присланной карточке. Принятая ведёт на
   * ответ по штрихкоду — нативный экран `wellness/result/[barcode]`,
   * остальные — в историю проверок `wellness/history`.
   */
  | { kind: 'wellness-product'; barcode: string }
  | { kind: 'wellness-history' }
  /**
   * Знакомства: пуш «Новая заявка» ведёт на `/union/connections`. Своими
   * экранами — связи, лайки и анкета человека; остальное (подборки, скрытые,
   * своя анкета) — вход в раздел, он сам решит, куда вести.
   * `/union/chats/*` сюда не попадает: переписка Знакомств переехала в
   * «Общение», и такие пути ведут на сайт, где стоят редиректы.
   */
  | { kind: 'union'; section: 'entry' | 'connections' | 'likes' }
  | { kind: 'union-user'; userId: string }
  /**
   * Вышла новая версия приложения: пуш «Доступна новая версия» с путём
   * `/app` (на сайте это страница загрузки). В приложении — вкладка
   * «Сервисы»: там раздел обновления, который при открытии вкладки сам
   * проверяет версию и показывает, что есть новая.
   */
  | { kind: 'app-update' }
  /**
   * Раздел, которого в приложении нет: Рынок, Объявления, «Работа»,
   * «Мотивация», «Музыка», Библиотека, админка. Путь сохранён
   * целиком вместе с `?query`: `/motivation/create?reel=<id>` без запроса
   * открыл бы пустую форму вместо нужного рилса.
   */
  | { kind: 'site'; path: string };

/**
 * Служебные разделы сайта, по форме пути неотличимые от беседы
 * (`/chat/<что-то>`). Список закрытый: всё, что не перечислено, — это id
 * беседы, и ошибиться в эту сторону безопаснее, чем в обратную.
 */
const CHAT_SECTIONS = new Set(['requests', 'with', 'people', 'appearance', 'new']);

/** Путь без `?query` и `#hash` — по нему опознаётся раздел. */
function pathnameOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

/** Сегменты пути без пустых: `/chat/c-1/` → `['chat', 'c-1']`. */
function segmentsOf(pathname: string): string[] {
  return pathname.split('/').filter((part) => part.length > 0);
}

/** Сегмент id: пустой или `%`-битый идентификатором быть не может. */
function idOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length > 0 ? decoded : null;
  } catch {
    // Битая `%`-последовательность: адресом это уже не является.
    return null;
  }
}

/**
 * Разбор пути портала в раздел приложения.
 *
 * Всё непонятное — `inbox`, а не «главная»: до VED-330 любой пуш, кроме
 * беседы, приземлялся на список чатов, и человек не узнавал, что вообще
 * произошло. Лента — то место, где уведомление точно есть целиком.
 */
export function resolveNotificationTarget(url: unknown): NotificationTarget {
  if (typeof url !== 'string') return { kind: 'inbox' };
  const trimmed = url.trim();
  // Только свои пути: абсолютный адрес в `url` уведомления не приходит, а
  // если придёт — вести по нему внутрь приложения нельзя.
  if (!trimmed.startsWith('/')) return { kind: 'inbox' };

  const segments = segmentsOf(pathnameOf(trimmed));
  const [first, second, third] = segments;

  if (first === 'notifications') return { kind: 'inbox' };

  if (first === 'chat') {
    if (second === 'requests') return { kind: 'chat-requests' };
    if (second === 'with') {
      const userId = idOf(third);
      return userId ? { kind: 'person', userId } : { kind: 'people' };
    }
    if (second && !CHAT_SECTIONS.has(second)) {
      const conversationId = idOf(second);
      if (conversationId) return { kind: 'chat', conversationId };
    }
    return { kind: 'inbox' };
  }

  // Бывший сервис «Контакты» — теперь раздел `chat/people` на сервере, но
  // ссылки в уведомлениях остались с прежним префиксом (`notification-copy.ts`).
  if (first === 'contacts') {
    if (second === 'requests') return { kind: 'people' };
    if (second === 'users') {
      const userId = idOf(third);
      if (userId) return { kind: 'person', userId };
    }
    return { kind: 'people' };
  }

  if (first === 'people') {
    const userId = idOf(second);
    return userId ? { kind: 'person', userId } : { kind: 'people' };
  }

  // Поддержка (VED-336). Гостевая ссылка `/support/track/<token>` — не
  // обращение аккаунта, её открывает сайт.
  if (first === 'support' && second !== 'track') {
    return { kind: 'support', ticketId: idOf(second) };
  }

  if (first === 'wellness') {
    const barcode = second === 'products' ? third : undefined;
    if (barcode && /^\d{8,14}$/.test(barcode)) {
      return { kind: 'wellness-product', barcode };
    }
    if (second === 'history') return { kind: 'wellness-history' };
  }

  if (first === 'union' && second !== 'chats' && second !== 'admin') {
    if (second === 'connections' || second === 'likes') return { kind: 'union', section: second };
    if (second === 'users') {
      const userId = idOf(third);
      if (userId) return { kind: 'union-user', userId };
    }
    return { kind: 'union', section: 'entry' };
  }

  if (first === 'app' && !second) return { kind: 'app-update' };

  if (first === 'communities') {
    const communityId = idOf(second);
    if (communityId) return { kind: 'community', communityId };
  }

  return { kind: 'site', path: trimmed };
}

/** Куда переходить: свой экран или браузер с сайтом. */
export type NotificationDestination =
  | { kind: 'route'; pathname: string; params?: Record<string, string> }
  | { kind: 'site'; path: string };

/** Экран приложения под раздел. `null` — своего экрана нет. */
export function routeOfTarget(target: NotificationTarget): NotificationDestination | null {
  switch (target.kind) {
    case 'chat':
      return { kind: 'route', pathname: '/chat/[id]', params: { id: target.conversationId } };
    case 'chat-requests':
      return { kind: 'route', pathname: '/chat/requests' };
    case 'person':
      return { kind: 'route', pathname: '/people/[id]', params: { id: target.userId } };
    case 'community':
      return { kind: 'route', pathname: '/communities/[id]', params: { id: target.communityId } };
    case 'people':
      return { kind: 'route', pathname: '/people' };
    case 'inbox':
      return { kind: 'route', pathname: '/notifications' };
    case 'support':
      return target.ticketId
        ? { kind: 'route', pathname: '/support/[id]', params: { id: target.ticketId } }
        : { kind: 'route', pathname: '/support' };
    case 'wellness-product':
      return {
        kind: 'route',
        pathname: '/wellness/result/[barcode]',
        params: { barcode: target.barcode },
      };
    case 'wellness-history':
      return { kind: 'route', pathname: '/wellness/history' };
    case 'union':
      return {
        kind: 'route',
        pathname: target.section === 'entry' ? '/union' : `/union/${target.section}`,
      };
    case 'union-user':
      return { kind: 'route', pathname: '/union/users/[id]', params: { id: target.userId } };
    case 'app-update':
      return { kind: 'route', pathname: '/services' };
    case 'site':
      return null;
  }
}

/**
 * Нажали пуш.
 *
 * Раздел без своего экрана ведёт НЕ в браузер, а в ленту уведомлений. Две
 * причины, обе про холодный старт: открывать Chrome Custom Tab поверх
 * приложения, которое само ещё поднимается, — верный способ получить
 * молчащее нажатие, а человек, нажавший на пуш, ждал приложение, а не
 * браузер. В ленте его ждёт то же уведомление целиком, и уже оттуда он сам
 * решает, открывать ли сайт.
 */
export function pushDestination(url: unknown): NotificationDestination {
  const target = resolveNotificationTarget(url);
  return routeOfTarget(target) ?? { kind: 'route', pathname: '/notifications' };
}

/**
 * Нажали карточку в ленте.
 *
 * Здесь наоборот: человек уже смотрит на уведомление, прочитал текст и
 * выбрал именно его — отправить его обратно в ту же ленту значило бы не
 * сделать ничего. Раздела в приложении нет, поэтому открывается сайт.
 */
export function inboxDestination(url: unknown): NotificationDestination {
  const target = resolveNotificationTarget(url);
  if (target.kind === 'site') return { kind: 'site', path: target.path };
  // Своего экрана нет только у `site`, поэтому ветка ниже всегда даёт маршрут;
  // `??` стоит ради типа, а не ради случая.
  return routeOfTarget(target) ?? { kind: 'route', pathname: '/notifications' };
}
