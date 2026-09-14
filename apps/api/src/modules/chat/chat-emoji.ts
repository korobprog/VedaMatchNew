import { CHAT_FAVORITE_EMOJI_MAX } from '@vedamatch/shared';
import { ChatValidationError, isSingleEmoji } from './chat-validate';

/**
 * Набор «Избранных» по умолчанию, присланный из админки (VED-123).
 *
 * Каждый элемент — ровно один смайлик: та же проверка, что у реакций, иначе
 * в панели у всех участников оказалась бы кнопка с «ок» или с тремя
 * смайликами сразу. Пробелы по краям срезаются, повторы убираются с
 * сохранением порядка — порядок и есть то, как администрация расставила набор.
 */
export function normalizeFavoriteEmojis(input: unknown): string[] {
  if (!Array.isArray(input))
    throw new ChatValidationError('Набор смайликов должен быть списком');

  const result: string[] = [];
  for (const item of input) {
    const emoji = typeof item === 'string' ? item.trim() : '';
    if (!isSingleEmoji(emoji))
      throw new ChatValidationError(
        `«${String(item).slice(0, 16)}» — не один смайлик`,
      );
    if (!result.includes(emoji)) result.push(emoji);
  }

  if (result.length > CHAT_FAVORITE_EMOJI_MAX)
    throw new ChatValidationError(
      `В избранном не больше ${CHAT_FAVORITE_EMOJI_MAX} смайликов`,
    );
  return result;
}
