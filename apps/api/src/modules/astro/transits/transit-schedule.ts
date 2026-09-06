/**
 * Когда у человека «утро» для рассылки персонального дня.
 *
 * Раньше окно было одно на всех — 09:00–11:00 по Москве, — и на Дальнем
 * Востоке пуш приходил к вечеру. Теперь час считается в часовом поясе
 * человека из портального профиля (`User.timeZone`, определяет браузер);
 * без него — по Москве, как было. Чистый модуль: сервер живёт в UTC, и
 * местный час нельзя брать из локали процесса.
 */

/** Задуманное время рассылки — 09:00 местного, когда день только начинается. */
export const PUSH_HOUR_LOCAL = 9;
/**
 * Окно, а не одна минута: обход идёт раз в час, деплой или падение Redis не
 * должны отменять сегодняшнюю рассылку. Но и тянуть окно до бесконечности
 * нельзя — иначе рестарт вечером снова выглядит как рассылка не по расписанию.
 */
export const PUSH_WINDOW_HOURS = 2;
/** Москва круглый год UTC+3: перевода часов в России нет с 2014-го. */
export const DEFAULT_TIME_ZONE = 'Europe/Moscow';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/**
 * Местный час 0..23. Незнакомая зона (переименовали, опечатка в старой
 * записи) — считаем по Москве, а не роняем рассылку всем.
 */
export function localHour(now: Date, timeZone: string | null | undefined): number {
  const formatter =
    (timeZone ? formatterFor(timeZone) : null) ?? formatterFor(DEFAULT_TIME_ZONE)!;
  const part = formatter.formatToParts(now).find((p) => p.type === 'hour');
  return Number(part?.value ?? 0) % 24;
}

/** Попадает ли момент в утреннее окно рассылки по местному времени человека. */
export function isLocalPushWindow(
  now: Date,
  timeZone: string | null | undefined,
): boolean {
  const hour = localHour(now, timeZone);
  return hour >= PUSH_HOUR_LOCAL && hour < PUSH_HOUR_LOCAL + PUSH_WINDOW_HOURS;
}

/**
 * Ключ обхода: раз в час по UTC. Внутри часа местный час ни у кого не
 * меняется (зон с получасовым сдвигом это тоже касается — они сдвигают
 * границу, но не число попаданий), поэтому чаще сканировать незачем.
 */
export function scanKey(now: Date): string {
  return now.toISOString().slice(0, 13);
}
