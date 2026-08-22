/**
 * «В сети» и «был недавно» по отметке последнего визита.
 *
 * Отдельный модуль, а не ветка в шапке беседы: пороги — это решение, а не
 * оформление, и его проверяет тест. Отметку портал пишет раз в пять минут
 * (LAST_SEEN_THROTTLE_MS в AuthGuard), поэтому «в сети» не может быть точнее
 * этих пяти минут — обещать секундную точность было бы враньём.
 */
const ONLINE_MS = 5 * 60_000;
const RECENT_MS = 60 * 60_000;

export function presenceLabel(
  lastSeenAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!lastSeenAt) return null;
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return null;

  const ago = now.getTime() - seen.getTime();
  if (ago < 0) return "в сети";
  if (ago <= ONLINE_MS) return "в сети";
  if (ago <= RECENT_MS) return "был недавно";

  const days = Math.floor(ago / 86_400_000);
  if (days === 0)
    return `был ${seen.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  if (days === 1) return "был вчера";
  return `был ${seen.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  })}`;
}

/** Зелёная точка ставится только в первые пять минут. */
export function isOnline(
  lastSeenAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return false;
  return now.getTime() - seen.getTime() <= ONLINE_MS;
}
