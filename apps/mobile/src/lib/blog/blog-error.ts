import type { BlogImageRejection } from '@vedamatch/shared';
import { ApiError } from '@/lib/api/client';
import { plural } from '@/lib/chat/plural';

/**
 * Ошибки блог-ленты по-русски (VED-334).
 *
 * Сервис отвечает кодами (`post_empty`, `daily_limit_reached` …), а не
 * фразами: `ApiError.message` у клиента — это код как есть. Показать его
 * человеку значит показать «daily_limit_reached». Словарь — тот же, что у
 * сайта (`apps/web/src/lib/blog-client-api.ts`), чтобы одна беда называлась
 * одинаково в браузере и в приложении.
 */
const MESSAGES: Record<string, string> = {
  post_empty: 'Напишите что-нибудь или добавьте фотографию.',
  title_too_long: 'Заголовок слишком длинный.',
  text_too_long: 'Текст слишком длинный.',
  too_many_images: 'Больше фотографий в один пост не поместится.',
  daily_limit_reached: 'На сегодня постов достаточно — продолжите завтра.',
  image_upload_unavailable: 'Загрузка фотографий сейчас недоступна.',
  unsupported_type: 'Такой файл не подходит: нужен JPEG, PNG или WebP.',
  file_too_large: 'Файл слишком большой.',
  processing_failed: 'Не удалось обработать фотографию.',
  post_not_found: 'Пост не найден — возможно, его уже удалили.',
  author_not_found: 'Участник не найден.',
  not_your_post: 'Это чужой пост.',
  repost_not_editable: 'Репост не правится — поправить можно только исходный пост.',
};

/** Текст для кода сервиса; незнакомый код — `null`, решает вызывающий. */
export function blogCodeMessage(code: string): string | null {
  return MESSAGES[code] ?? null;
}

/**
 * Ошибка запроса к ленте → строка на экран. `fallback` — что именно не
 * вышло («Не удалось загрузить ленту.»): у загрузки, публикации и удаления
 * слова разные.
 */
export function describeBlogError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    // Статус 0 ставит сам клиент, когда сеть не дала обновить сессию.
    if (error.status === 0) return error.message || 'Нет соединения с сервером.';
    if (error.status === 401) return 'Сессия закончилась. Войдите снова.';
    // 413 отдаёт не сервис, а multer/прокси — файл больше предела.
    if (error.status === 413) return 'Фотографии слишком большие — каждая до 10 МБ.';
    if (error.status === 429) return 'Слишком часто. Подождите немного и повторите.';
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
    return blogCodeMessage(error.message) ?? fallback;
  }
  return 'Нет соединения с сервером.';
}

/** Пост не найден: экрану поста нужно показать «удалён», а не «повторить». */
export function isBlogPostGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * Пост опубликован, но часть фотографий не доехала: сервер возвращает их
 * рядом с постом, а не вместо него. Сказать надо — иначе человек ищет в
 * ленте фото, которого там нет. `null` — доехали все.
 */
export function describeFailedPhotos(failed: readonly BlogImageRejection[]): string | null {
  if (failed.length === 0) return null;
  const reasons = [...new Set(failed.map((item) => blogCodeMessage(item.reason) ?? 'Не удалось загрузить.'))];
  const lead = `Пост опубликован, но ${failed.length} ${plural(failed.length, 'фотография не загрузилась', 'фотографии не загрузились', 'фотографий не загрузились')}`;
  return `${lead}: ${reasons.join(' ')}`;
}
