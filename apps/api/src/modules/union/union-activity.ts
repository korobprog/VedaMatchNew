import type { UnionActivityLevel } from '@vedamatch/shared';

const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Огрубляет lastSeenAt до уровня активности: точное время визита — лишние
 * данные о человеке, а «был(а) сегодня» решает ту же задачу доверия к профилю.
 */
export function toActivityLevel(
  lastSeenAt: Date | null | undefined,
  now: Date = new Date(),
): UnionActivityLevel | null {
  if (!lastSeenAt) return null;

  const elapsed = now.getTime() - lastSeenAt.getTime();
  if (elapsed < ONLINE_WINDOW_MS) return 'online';
  if (elapsed < DAY_MS) return 'today';
  if (elapsed < WEEK_MS) return 'week';
  return 'long_ago';
}

/**
 * Точное время визита для карточки — «был(а) сегодня в 14:32» вместо просто
 * «сегодня». Отдаётся только по свежим визитам: у того, кто не заходил
 * неделю, точная отметка ничего не добавляет к «давно», зато рассказывает о
 * человеке больше, чем он собирался сообщить.
 */
export function toLastSeenAt(
  lastSeenAt: Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!lastSeenAt) return null;
  const level = toActivityLevel(lastSeenAt, now);
  if (level === null || level === 'long_ago') return null;
  return lastSeenAt.toISOString();
}
