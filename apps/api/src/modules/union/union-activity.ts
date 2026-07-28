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
