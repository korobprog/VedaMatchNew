import { DateTime } from 'luxon';
import type { NoticeRecurrence } from '@vedamatch/shared';
import { ekadashiBetween } from './ekadashi-dates';

/**
 * Разворачивание повторяющихся событий.
 *
 * Вхождения не хранятся строками намеренно: правка «воскресной программы»
 * превратилась бы в правку сотни записей, а отмена одной даты — в поиск
 * нужной строки среди них. Здесь чистая функция: на вход событие и окно, на
 * выход даты внутри окна.
 */

/**
 * Потолок вхождений на одно событие в одном окне. Еженедельная программа на
 * год — это 52 даты; тысяча означает, что окно запросили абсурдное, и лучше
 * обрезать, чем растить ответ.
 */
export const MAX_OCCURRENCES = 1000;

export interface RecurringEvent {
  startsAt: Date;
  endsAt: Date | null;
  repeat: NoticeRecurrence;
  repeatUntil: Date | null;
  /**
   * Зона проведения. Шаг считается в ней, а не в UTC: «программа в 17:00»
   * обязана остаться 17:00 и после перевода часов, иначе весной она
   * съезжает на час.
   */
  timeZone: string | null;
}

export interface Occurrence {
  startsAt: Date;
  endsAt: Date | null;
}

/** Шаг правила в единицах luxon. `null` — правило не шаговое. */
const STEP: Partial<
  Record<NoticeRecurrence, { unit: 'weeks' | 'months'; size: number }>
> = {
  weekly: { unit: 'weeks', size: 1 },
  biweekly: { unit: 'weeks', size: 2 },
  monthly: { unit: 'months', size: 1 },
};

/**
 * Вхождения события внутри окна `[from, to]`.
 *
 * Длительность переносится с исходного события: у повторяющейся программы
 * она одна и та же, а хранить её отдельно значило бы держать два источника
 * правды о том, когда программа кончается.
 */
export function expandOccurrences(
  event: RecurringEvent,
  from: Date,
  to: Date,
): Occurrence[] {
  const durationMs =
    event.endsAt !== null
      ? event.endsAt.getTime() - event.startsAt.getTime()
      : null;
  const withDuration = (start: Date): Occurrence => ({
    startsAt: start,
    endsAt: durationMs === null ? null : new Date(start.getTime() + durationMs),
  });

  if (event.repeat === 'none') {
    // Разовое событие попадает в окно или нет — размножать нечего.
    return event.startsAt >= from && event.startsAt <= to
      ? [withDuration(event.startsAt)]
      : [];
  }

  // Повтор не переживает свою дату окончания, даже если окно шире.
  const limit =
    event.repeatUntil !== null && event.repeatUntil < to
      ? event.repeatUntil
      : to;
  if (limit < from) return [];

  if (event.repeat === 'ekadashi') {
    // Лунные даты берутся таблицей: правилом они не выражаются. Время суток
    // остаётся от исходного события — экадаши задаёт день, а не час.
    const start = event.startsAt > from ? event.startsAt : from;
    return ekadashiBetween(start, limit)
      .map((day) => withDuration(atTimeOf(day, event.startsAt, event.timeZone)))
      .slice(0, MAX_OCCURRENCES);
  }

  const step = STEP[event.repeat];
  if (!step) return [];

  const zone = resolveZone(event.timeZone);
  const origin = DateTime.fromJSDate(event.startsAt, { zone });
  const occurrences: Occurrence[] = [];
  // Каждое вхождение считается от исходной даты, а не от предыдущего:
  // «каждое 31-е» тогда даёт 31 января, 28 февраля, 31 марта, а не
  // сползает на 28-е навсегда после первого короткого месяца.
  for (let index = 0; occurrences.length < MAX_OCCURRENCES; index += 1) {
    const at = origin.plus({ [step.unit]: index * step.size }).toJSDate();
    if (at > limit) break;
    if (at >= from) occurrences.push(withDuration(at));
    // Предохранитель от правила, которое не двигается вперёд.
    if (index > 0 && at.getTime() === origin.toJSDate().getTime()) break;
  }
  return occurrences;
}

/** Незнакомую зону не роняем: считаем в UTC и пишем об этом в тестах. */
function resolveZone(timeZone: string | null): string {
  if (!timeZone) return 'utc';
  return DateTime.local().setZone(timeZone).isValid ? timeZone : 'utc';
}

/** День из первой даты, время суток — из второй, обе в зоне события. */
function atTimeOf(day: Date, source: Date, timeZone: string | null): Date {
  const zone = resolveZone(timeZone);
  const local = DateTime.fromJSDate(source, { zone });
  return DateTime.fromJSDate(day, { zone: 'utc' })
    .setZone(zone, { keepLocalTime: true })
    .set({
      hour: local.hour,
      minute: local.minute,
      second: local.second,
      millisecond: local.millisecond,
    })
    .toJSDate();
}
