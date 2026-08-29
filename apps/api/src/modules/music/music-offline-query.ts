/**
 * Разбор запроса на сверку офлайн-копий. Чистый модуль по образцу
 * `music-catalog-query.ts`: здесь живёт условие видимости, а оно — обещание
 * приватности, а не деталь реализации, и держать его должен тест.
 */

/** Сколько идентификаторов принимаем за раз. Больше — это уже не проверка. */
export const MAX_OFFLINE_IDS = 500;

/**
 * Что вообще считать идентификаторами. В теле запроса может прийти что
 * угодно: `null`, число, повтор одного и того же.
 */
export function normalizeOfflineIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  );
  return Array.from(new Set(ids)).slice(0, MAX_OFFLINE_IDS);
}

export interface OfflineVisibility {
  id: { in: string[] };
  OR?: Array<{ status: 'published' } | { uploadedById: string }>;
}

/**
 * Условие видимости — то же, что у потока: опубликованное всем, своё
 * неопубликованное загрузившему, всё — редакции.
 *
 * Без него по офлайн-сверке перебирались бы чужие черновики: положил
 * идентификатор в список — узнал, что запись существует.
 */
export function offlineAllowedWhere(
  ids: string[],
  viewer: { userId: string; isAdmin: boolean },
): OfflineVisibility {
  if (viewer.isAdmin) return { id: { in: ids } };
  return {
    id: { in: ids },
    OR: [{ status: 'published' }, { uploadedById: viewer.userId }],
  };
}
