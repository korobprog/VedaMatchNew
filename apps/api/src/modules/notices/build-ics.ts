/**
 * Сборка `.ics` без зависимостей: формат простой, а библиотека ради
 * пятидесяти строк тянула бы своё представление о часовых поясах.
 *
 * Время пишется в UTC (суффикс `Z`). Это допустимо по RFC 5545 и снимает
 * необходимость вкладывать VTIMEZONE: клиент показывает событие в своей
 * зоне, а название площадки и город остаются в тексте.
 */

export interface IcsEvent {
  /** Стабильный идентификатор: у повторов — id объявления плюс дата. */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
}

/** Сколько длится событие без явного конца. */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export function buildIcs(events: IcsEvent[], now: Date): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VedaMatch//Notices//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    const end =
      event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_DURATION_MS);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${formatUtc(now)}`,
      `DTSTART:${formatUtc(event.startsAt)}`,
      `DTEND:${formatUtc(end)}`,
      `SUMMARY:${escapeText(event.title)}`,
    );
    if (event.description)
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url) lines.push(`URL:${escapeText(event.url)}`);
    lines.push(`CREATED:${formatUtc(event.createdAt)}`, 'END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 требует CRLF и советует держать строки короче 75 октетов.
  return lines.flatMap(foldLine).join('\r\n') + '\r\n';
}

/** `20260906T140000Z` — базовый формат из RFC 5545. */
export function formatUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * Экранирование по RFC 5545: обратный слэш, точка с запятой, запятая и
 * перевод строки. Порядок важен — слэш первым, иначе он экранирует
 * то, что мы сами же добавили.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Сворачивание длинных строк. Считаем в октетах, а не в символах: кириллица
 * в UTF-8 занимает по два байта, и разрез по 75 символам дал бы строку в 150
 * октетов — часть клиентов такую отвергает.
 */
export function foldLine(line: string): string[] {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return [line];

  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    // Первая строка 75 октетов, продолжения — 74 плюс ведущий пробел.
    const limit = parts.length === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);
    // Не режем посередине многобайтового символа: продолжающие байты UTF-8
    // имеют старшие биты 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80)
      end -= 1;
    const chunk = bytes.subarray(start, end).toString('utf8');
    parts.push(parts.length === 0 ? chunk : ` ${chunk}`);
    start = end;
  }
  return parts;
}
