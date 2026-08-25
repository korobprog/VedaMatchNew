import type { UnionActivityLevel } from "@vedamatch/shared";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const levelLabels: Record<UnionActivityLevel, string> = {
  online: "В сети",
  today: "Был(а) сегодня",
  week: "Был(а) на этой неделе",
  long_ago: "Давно не заходил(а)",
};

function hoursSuffix(hours: number): string {
  const lastTwo = hours % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "часов";
  switch (hours % 10) {
    case 1:
      return "час";
    case 2:
    case 3:
    case 4:
      return "часа";
    default:
      return "часов";
  }
}

function minutesSuffix(minutes: number): string {
  const lastTwo = minutes % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "минут";
  switch (minutes % 10) {
    case 1:
      return "минуту";
    case 2:
    case 3:
    case 4:
      return "минуты";
    default:
      return "минут";
  }
}

/**
 * Дни недели в винительном падеже: `toLocaleDateString` даёт именительный, и
 * выходило «был в суббота».
 */
const weekdayNames = [
  "в воскресенье",
  "в понедельник",
  "во вторник",
  "в среду",
  "в четверг",
  "в пятницу",
  "в субботу",
];

function clockTime(date: Date): string {
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Подпись последнего визита.
 *
 * Чем свежее визит, тем полезнее относительный отсчёт: «12 минут назад»
 * говорит «человек здесь» лучше любого времени на часах. Дальше по шкале
 * относительность мешает — «19 часов назад» приходится пересчитывать в уме,
 * поэтому со вчерашнего дня подпись переходит на часы: «был(а) вчера в 21:40».
 *
 * Точного времени может не быть: сервер отдаёт его только по свежим визитам.
 * Тогда остаётся прежняя огрублённая подпись уровня.
 */
export function lastSeenLabel(
  activity: UnionActivityLevel | null,
  lastSeenAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!activity || activity === "long_ago") return null;
  if (activity === "online") return levelLabels.online;
  if (!lastSeenAt) return levelLabels[activity];

  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return levelLabels[activity];

  const elapsed = now.getTime() - seen.getTime();
  // Часы сервера и телефона расходятся: визит «из будущего» на минуту —
  // обычное дело, и «-1 минуту назад» на карточке выглядело бы поломкой.
  if (elapsed < 0) return levelLabels.online;

  if (elapsed < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(elapsed / MINUTE_MS));
    return `Был(а) ${minutes} ${minutesSuffix(minutes)} назад`;
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (seen >= startOfToday) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `Был(а) ${hours} ${hoursSuffix(hours)} назад`;
  }

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (seen >= startOfYesterday) {
    return `Был(а) вчера в ${clockTime(seen)}`;
  }

  return `Был(а) ${weekdayNames[seen.getDay()]} в ${clockTime(seen)}`;
}
