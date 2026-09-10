/**
 * Даты ночлега. Считаются днями, а не часами: заезд и выезд — это календарные
 * дни, и «две ночи» не должны зависеть от часового пояса того, кто оформлял
 * заявку. Поэтому дата разбирается как полночь UTC, а в базе лежит `@db.Date`.
 */

/** Дольше месяца подряд — это уже не заявка на ночлег, а переезд. */
export const MAX_NIGHTS = 31;

/** Заявка на год вперёд — почти всегда опечатка в году. */
export const MAX_DAYS_AHEAD = 365;

export class TravelDateError extends Error {}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Разобрать `YYYY-MM-DD` в полночь UTC.
 *
 * `new Date('2026-02-30')` в V8 молча даёт 2 марта, поэтому день сверяется
 * обратно: заявка на несуществующее число обязана падать, а не переезжать.
 */
export function parseStayDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !ISO_DATE.test(value.trim())) {
    throw new TravelDateError(`Дата «${field}» должна быть в виде ГГГГ-ММ-ДД`);
  }
  const [, year, month, day] = ISO_DATE.exec(value.trim()) as RegExpExecArray;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new TravelDateError(`Такой даты не существует: ${value}`);
  }
  return date;
}

/** Обратно в `YYYY-MM-DD` — так дата уходит наружу в DTO. */
export function formatStayDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Ночей между заездом и выездом. Даты уже разобраны parseStayDate. */
export function countNights(checkIn: Date, checkOut: Date): number {
  const ms = checkOut.getTime() - checkIn.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export interface StayRange {
  checkIn: Date;
  checkOut: Date;
  nights: number;
}

/**
 * Разобрать и проверить промежуток. `today` передаётся снаружи, а не берётся
 * из `new Date()` внутри: иначе тест на границу «вчера» зависел бы от часа
 * запуска.
 */
export function parseStayRange(
  rawCheckIn: unknown,
  rawCheckOut: unknown,
  today: Date,
): StayRange {
  const checkIn = parseStayDate(rawCheckIn, 'заезд');
  const checkOut = parseStayDate(rawCheckOut, 'выезд');
  const nights = countNights(checkIn, checkOut);

  if (nights < 1) {
    throw new TravelDateError('Выезд должен быть хотя бы на день позже заезда');
  }
  if (nights > MAX_NIGHTS) {
    throw new TravelDateError(
      `Больше ${MAX_NIGHTS} ночей подряд одной заявкой не бронируют — напишите хозяину`,
    );
  }

  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  if (checkIn.getTime() < todayUtc.getTime()) {
    throw new TravelDateError('Заезд задним числом не оформляют');
  }
  if (countNights(todayUtc, checkIn) > MAX_DAYS_AHEAD) {
    throw new TravelDateError(
      'Заезд больше чем через год — проверьте год в дате',
    );
  }

  return { checkIn, checkOut, nights };
}

/**
 * Пересекаются ли два промежутка проживания.
 *
 * Выезд одного и заезд другого в один день пересечением не считаются: гость
 * освобождает комнату утром, следующий въезжает днём. Ровно поэтому сравнение
 * строгое, а не `<=`, — иначе половина комнат была бы «занята» впустую.
 */
export function rangesOverlap(
  a: { checkIn: Date; checkOut: Date },
  b: { checkIn: Date; checkOut: Date },
): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}
