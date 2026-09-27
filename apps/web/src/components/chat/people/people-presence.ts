import { isOnline } from "../chat-presence";

/**
 * Чистая логика карточки справочника: «в сети / был …» (VED-318) и метка
 * новичка (VED-319). Отдельным модулем, потому что пороги — решение, и его
 * проверяет тест, а не глаз.
 */

const DAY_MS = 86_400_000;

/** Сколько суток держится метка новичка: заказчик назвал три дня. */
export const NEWCOMER_DAYS = 3;

export type NewcomerDay = 0 | 1 | 2;

/**
 * Какие сутки человек на портале: 0 — первые 24 часа, 1 — вторые, 2 —
 * третьи; null — метку уже не показывать (или дата неизвестна).
 *
 * Считаем сутками от момента регистрации, а не календарными днями: иначе
 * пришедший в 23:50 через десять минут стал бы «вторым днём», и цвет метки
 * зависел бы от часового пояса смотрящего.
 */
export function newcomerDay(
  joinedAt: string | null | undefined,
  now: Date = new Date(),
): NewcomerDay | null {
  if (!joinedAt) return null;
  const joined = new Date(joinedAt).getTime();
  if (Number.isNaN(joined)) return null;
  const ago = now.getTime() - joined;
  // Часы клиента могут отставать от сервера: «из будущего» — всё ещё первые сутки.
  if (ago < 0) return 0;
  const day = Math.floor(ago / DAY_MS);
  return day < NEWCOMER_DAYS ? (day as NewcomerDay) : null;
}

/** Подпись для скринридера и подсказки: цвет — не единственный носитель смысла. */
export function newcomerLabel(day: NewcomerDay): string {
  return `Новый участник: ${day + 1}-й день на портале`;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function hhmm(date: Date): string {
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * «в сети» либо «был(а) <дата> в <время>» — заказчик просил точные дату и
 * время, а не «был недавно», как в шапке беседы. «В сети» — те же пять
 * минут, что в чате: чаще отметку портал не пишет.
 *
 * Время — в поясе смотрящего (карточки рисуются в браузере). Год
 * добавляется, только когда он не текущий.
 */
export function lastSeenLabel(
  lastSeenAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!lastSeenAt) return null;
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return null;
  if (isOnline(lastSeenAt, now) || seen.getTime() > now.getTime()) {
    return "в сети";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  let day: string;
  if (sameCalendarDay(seen, now)) day = "сегодня";
  else if (sameCalendarDay(seen, yesterday)) day = "вчера";
  else
    day = seen.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      ...(seen.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    });
  return `был(а) ${day} в ${hhmm(seen)}`;
}
