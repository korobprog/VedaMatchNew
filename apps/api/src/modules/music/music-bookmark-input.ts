import { MUSIC_BOOKMARK_LABEL_MAX } from '@vedamatch/shared';

/**
 * Разбор ввода метки-закладки (VED-388). Чистые функции под тестом: здесь
 * решается, что попадёт в базу из пришедшего с клиента, — а клиенту верить
 * нельзя ни в позиции, ни в подписи.
 */

/**
 * Сколько меток на одну запись у одного человека. Не лимит «для порядка»:
 * без потолка скрипт с тем же ключом сессии за минуту кладёт в таблицу
 * миллион строк, а человеку и на трёхчасовой лекции хватает пары десятков.
 */
export const MUSIC_BOOKMARKS_PER_TRACK_MAX = 200;

/**
 * Подпись: пробелы по краям и повторные внутри сжимаем, пустое — `null`
 * (показываем время), длинное — обрезаем, а не отказываем: человек набирал
 * подпись на телефоне, и терять её из-за лишнего слова обидно.
 *
 * `undefined` — поле не прислали, и это отличается от `null` («стереть»).
 */
export function normalizeBookmarkLabel(
  raw: unknown,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return Array.from(text).slice(0, MUSIC_BOOKMARK_LABEL_MAX).join('');
}

/**
 * Позиция: целые секунды в пределах записи. `null` — прислали не число:
 * метку «где-то» ставить некуда, и сервис ответит отказом.
 *
 * Длительность записи в базе местами оценочная (VED-310), поэтому при
 * нулевой длительности не зажимаем сверху — иначе все метки такой записи
 * съезжали бы на ноль.
 */
export function clampBookmarkPosition(
  raw: unknown,
  durationSeconds: number,
): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const at = Math.max(0, Math.floor(raw));
  return durationSeconds > 0 ? Math.min(at, durationSeconds) : at;
}
