/**
 * «В сети» для значка на аватаре — своя копия окна из `union-activity.ts`
 * (контракт сервисного модуля запрещает импортировать чужой модуль). Здесь
 * нужен только бинарный факт, а не вся градация активности Union.
 */
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

export function isRecentlyOnline(
  lastSeenAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}
