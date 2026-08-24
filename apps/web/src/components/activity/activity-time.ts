/**
 * Относительное время для карточки ленты друзей. Без склонений на грани
 * ошибок («1 минуту» vs «5 минут») — виджет тесный, короткая форма читается
 * лучше точной.
 */
export function formatActivityTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  if (!Number.isFinite(diffMs) || diffMs < 0) return "только что";

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "только что";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} мин`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} ч`;
  if (diffMs < 2 * day) return "вчера";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} дн`;

  return then && new Date(then).getFullYear() === now.getFullYear()
    ? new Date(then).toLocaleDateString("ru", { day: "numeric", month: "short" })
    : new Date(then).toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric" });
}
