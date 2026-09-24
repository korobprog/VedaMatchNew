import { ApiError } from '@/lib/api/client';

/**
 * Ошибки Медиатеки по-русски (VED-331). Сервер отвечает фразами
 * (`NotFoundException('Запись не найдена')`), но фраза сервера — про запрос,
 * а человеку важно, что делать дальше: повторить, проверить сеть или
 * выбрать другую запись.
 */
export function describeMediaError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Запись недоступна — возможно, её сняли с публикации.';
    if (error.status === 503) return 'Хранилище записей сейчас недоступно. Попробуйте чуть позже.';
    if (error.status === 429) return 'Слишком много запросов. Подождите минуту и повторите.';
    if (error.status >= 500) return 'Сервер Медиатеки не отвечает. Попробуйте чуть позже.';
    return fallback;
  }
  if (error instanceof TypeError || (error instanceof Error && /network|fetch|timeout/i.test(error.message))) {
    return 'Нет связи с сервером. Проверьте интернет и повторите.';
  }
  return fallback;
}

/** Ошибка самого плеера (поток оборвался, файл не читается). */
export const PLAYBACK_FAILED = 'Не удалось воспроизвести запись. Проверьте интернет и повторите.';
