import type { UnionActivityLevel } from '@vedamatch/shared';

/**
 * Подпись последнего визита — перенос `apps/web/src/lib/union/last-seen.ts`.
 *
 * Чем свежее визит, тем полезнее относительный отсчёт: «12 минут назад»
 * говорит «человек здесь» лучше любого времени на часах. Со вчерашнего дня
 * подпись переходит на часы: «19 часов назад» приходится пересчитывать в уме.
 * Точного времени может не быть — сервер отдаёт его только по свежим
 * визитам; тогда остаётся огрублённая подпись уровня.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const LEVEL_LABELS: Record<UnionActivityLevel, string> = {
  online: 'В сети',
  today: 'Был(а) сегодня',
  week: 'Был(а) на этой неделе',
  long_ago: 'Давно не заходил(а)',
};

function plural(count: number, one: string, few: string, many: string): string {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  switch (count % 10) {
    case 1:
      return one;
    case 2:
    case 3:
    case 4:
      return few;
    default:
      return many;
  }
}

/** Дни недели в винительном падеже: «был в суббота» — поломка, а не подпись. */
const WEEKDAYS = [
  'в воскресенье',
  'в понедельник',
  'во вторник',
  'в среду',
  'в четверг',
  'в пятницу',
  'в субботу',
];

/**
 * Часы и минуты руками, а не `toLocaleTimeString`: Hermes на Android без
 * полного ICU отдаёт время в формате системы, а не «21:40», и подпись
 * расходилась бы с сайтом от телефона к телефону.
 */
function clockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function lastSeenLabel(
  activity: UnionActivityLevel | null,
  lastSeenAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!activity || activity === 'long_ago') return null;
  if (activity === 'online') return LEVEL_LABELS.online;
  if (!lastSeenAt) return LEVEL_LABELS[activity];

  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return LEVEL_LABELS[activity];

  const elapsed = now.getTime() - seen.getTime();
  // Часы сервера и телефона расходятся: визит «из будущего» на минуту —
  // обычное дело, и «-1 минуту назад» выглядело бы поломкой.
  if (elapsed < 0) return LEVEL_LABELS.online;

  if (elapsed < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(elapsed / MINUTE_MS));
    return `Был(а) ${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')} назад`;
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (seen >= startOfToday) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `Был(а) ${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`;
  }

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (seen >= startOfYesterday) return `Был(а) вчера в ${clockTime(seen)}`;

  return `Был(а) ${WEEKDAYS[seen.getDay()]} в ${clockTime(seen)}`;
}
