import {
  BLOG_FEED_REVIEW_NOTE_MAX_LENGTH,
  type BlogPostFeedStatus,
} from '@vedamatch/shared';

/**
 * Куда попадает пост: в общую ленту или только на личную страницу
 * (VED-686, часть 4). Чистая логика отдельно от сервиса — правила переходов
 * статуса проверяются тестом без базы.
 */

/**
 * Статус нового поста по полю `scope` из формы публикации.
 *
 * Нет поля (`undefined`, `null`, пустая строка из multipart) или `'feed'` —
 * пост идёт в общую ленту, как и раньше: установленные сборки приложения
 * `scope` не шлют. `'personal'` — только на личную страницу, в ленту такой
 * пост попадёт лишь после предложения и решения администратора. Остальное —
 * `'invalid'`: мусор из тела запроса отвечает 400, а не доезжает до базы.
 */
export function blogScopeStatus(
  value: unknown,
): Extract<BlogPostFeedStatus, 'feed' | 'personal'> | 'invalid' {
  if (value === undefined || value === null || value === '') return 'feed';
  if (value === 'feed') return 'feed';
  if (value === 'personal') return 'personal';
  return 'invalid';
}

/**
 * Что делать с запросом «предложить в общую ленту».
 *
 * - `'pending'` — перевести в очередь (из `personal` и из `rejected`: после
 *   отказа автор может поправить пост и предложить снова);
 * - `'unchanged'` — уже в очереди или уже в ленте, повтор ничего не меняет
 *   (идемпотентность: двойной тап не должен отвечать ошибкой).
 */
export function blogFeedRequestAction(
  status: BlogPostFeedStatus,
): 'pending' | 'unchanged' {
  return status === 'personal' || status === 'rejected'
    ? 'pending'
    : 'unchanged';
}

export type BlogFeedReviewError = 'decision_invalid' | 'note_too_long';

export type BlogFeedReview =
  { decision: 'approve' } | { decision: 'reject'; note: string | null };

/**
 * Разбор тела решения администратора. Пояснение нужно только отказу: оно
 * обрезается по краям, пустое становится `null`, длиннее предела — 400
 * (молча урезать чужой текст нельзя: админ решил бы, что автор прочтёт всё).
 */
export function parseBlogFeedReview(
  body: { decision?: unknown; note?: unknown } | null | undefined,
): BlogFeedReview | { error: BlogFeedReviewError } {
  const decision = body?.decision;
  if (decision === 'approve') return { decision };
  if (decision !== 'reject') return { error: 'decision_invalid' };
  const raw = typeof body?.note === 'string' ? body.note.trim() : '';
  if (raw.length > BLOG_FEED_REVIEW_NOTE_MAX_LENGTH) {
    return { error: 'note_too_long' };
  }
  return { decision, note: raw === '' ? null : raw };
}
