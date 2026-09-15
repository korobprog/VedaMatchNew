import type { TravelOccupancyRange } from "@vedamatch/shared";

/**
 * Календарная арифметика занятости. Даты — строки `ГГГГ-ММ-ДД` в днях UTC,
 * как в API: локальный `Date` на границе часового пояса сдвинул бы ночь на
 * соседний день, и занятая ночь показалась бы свободной.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Полночь UTC по строке; null — не дата или несуществующее число. */
function parse(iso: string | null | undefined): Date | null {
  const match = iso ? ISO_DATE.exec(iso) : null;
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? date
    : null;
}

const format = (date: Date) => date.toISOString().slice(0, 10);

function parseOrThrow(iso: string): Date {
  const date = parse(iso);
  if (!date) throw new RangeError(`Не дата: ${iso}`);
  return date;
}

export function addDays(iso: string, n: number): string {
  return format(new Date(parseOrThrow(iso).getTime() + n * DAY_MS));
}

/** Первое число месяца, в который попадает дата. */
export function monthStart(iso: string): string {
  const date = parseOrThrow(iso);
  return format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

/** Сдвиг на месяцы: `Date.UTC` сам переносит год через декабрь и январь. */
export function shiftMonth(monthIso: string, delta: number): string {
  const date = parseOrThrow(monthIso);
  return format(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1)),
  );
}

/** Все дни месяца по порядку. */
export function monthDays(monthIso: string): string[] {
  const first = monthStart(monthIso);
  const next = shiftMonth(first, 1);
  const days: string[] = [];
  for (let day = first; day < next; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * Ночи проживания: от заезда включительно до выезда исключительно. День
 * выезда — не ночь гостя: утром комната свободна для следующего.
 */
export function nightsOf(range: TravelOccupancyRange): string[] {
  const start = parse(range.checkIn);
  const end = parse(range.checkOut);
  if (!start || !end) return [];
  const nights: string[] = [];
  for (let time = start.getTime(); time < end.getTime(); time += DAY_MS) {
    nights.push(format(new Date(time)));
  }
  return nights;
}

export function busyNights(ranges: readonly TravelOccupancyRange[]): Set<string> {
  return new Set(ranges.flatMap(nightsOf));
}

/**
 * Пересекаются ли выбранные даты с занятыми. То же правило, что в API:
 * выезд одного в день заезда другого — не пересечение. Неполные или кривые
 * даты — не конфликт: форма ещё заполняется, ругаться рано.
 */
export function conflicts(
  ranges: readonly TravelOccupancyRange[],
  checkIn: string,
  checkOut: string,
): boolean {
  const start = parse(checkIn);
  const end = parse(checkOut);
  if (!start || !end || end <= start) return false;
  return ranges.some((range) => {
    const busyStart = parse(range.checkIn);
    const busyEnd = parse(range.checkOut);
    return Boolean(
      busyStart && busyEnd && busyStart < end && start < busyEnd,
    );
  });
}

/** Сдвиг дня недели к понедельнику: 0 — понедельник, 6 — воскресенье. */
export function mondayOffset(iso: string): number {
  return (parseOrThrow(iso).getUTCDay() + 6) % 7;
}

const monthName = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  timeZone: "UTC",
});
const dayMonthName = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * «сентябрь 2026». Месяц и год форматируются порознь: вместе Intl даёт
 * «сентябрь 2026 г.», а в шапке календаря «г.» — лишний шум.
 */
export function monthTitle(monthIso: string): string {
  const date = parseOrThrow(monthIso);
  return `${monthName.format(date)} ${date.getUTCFullYear()}`;
}

/** «15 сентября» — подпись дня для скринридера и подсказки. */
export function dayTitle(iso: string): string {
  return dayMonthName.format(parseOrThrow(iso));
}

/** Сегодня по UTC — те же сутки, по которым API проверяет заезд. */
export function todayIso(): string {
  return format(new Date());
}
