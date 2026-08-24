/**
 * Чистая логика открыток: какое событие сейчас показывать и как собрать
 * подпись под цитатой. Работа с базой и сборка кадра — в сервисе.
 */

export interface EventRow {
  id: string;
  date: Date;
  title: string;
  greeting: string | null;
  leadDays: number;
  enabled: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Календарный день UTC: у события есть дата, но нет времени. */
function dayStart(value: Date): number {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

/**
 * Ближайшее событие, ради которого стоит предложить открытку: включённое, до
 * которого осталось не больше `leadDays`, и сам день праздника. День после
 * праздника тоже считается — поздравить вечером и утром следующего дня
 * нормально, а вот заранее раньше срока — нет.
 */
export function upcomingEvent(
  events: readonly EventRow[],
  now: Date,
): EventRow | null {
  const today = dayStart(now);
  const candidates = events
    .filter((event) => event.enabled)
    .map((event) => ({ event, days: (dayStart(event.date) - today) / DAY_MS }))
    .filter(({ event, days }) => days <= event.leadDays && days >= -1)
    // Ближайшее по дате: сначала сегодняшнее, потом завтрашнее.
    .sort((a, b) => Math.abs(a.days) - Math.abs(b.days));
  return candidates[0]?.event ?? null;
}

/** Подпись под цитатой на открытке: автор, произведение, глава. */
export function attributionLine(post: {
  attributionSpeaker: string | null;
  attributionWork: string | null;
  attributionLocator: string | null;
}): string {
  const work = post.attributionWork?.trim() || null;
  const locator = stripWorkPrefix(
    post.attributionLocator?.trim() || null,
    work,
  );
  return [post.attributionSpeaker, work, locator]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' · ');
}

/**
 * Иногда генерация кладёт название произведения ещё раз в начало главы/стиха
 * («Бхагавад-гита как она есть 6.1» вместо «6.1») — тогда оно дублируется в
 * подписи. Сравнение без учёта регистра: разные генерации расходятся в
 * заглавных буквах чаще, чем в самом тексте.
 */
export function stripWorkPrefix(
  locator: string | null,
  work: string | null,
): string | null {
  if (!locator || !work) return locator;
  if (!locator.toLocaleLowerCase().startsWith(work.toLocaleLowerCase()))
    return locator;
  const rest = locator
    .slice(work.length)
    .replace(/^[·,:\s-]+/, '')
    .trim();
  return rest || null;
}
