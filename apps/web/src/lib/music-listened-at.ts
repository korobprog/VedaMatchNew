/**
 * Когда это слушали — словами.
 *
 * Своя копия, а не импорт из `components/activity`: по контракту сервисного
 * модуля общие хелперы дублируются внутрь сервиса, а не берутся у соседа.
 * Разница с лентой друзей тут не косметическая — там счёт идёт на минуты
 * («только что»), здесь на дни: история живёт три месяца, и «14:20» без даты
 * в ней бесполезно.
 *
 * Чистой функцией и под тестом: границы суток — классическое место, где
 * «вчера» показывается сегодняшней записи, и на глаз это не ловится.
 */

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const pad = (value: number): string => String(value).padStart(2, '0');

/** Начало суток, в которые попадает момент. */
function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function formatListenedAt(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';

  const time = `${at.getHours()}:${pad(at.getMinutes())}`;
  // Считаем по календарным суткам, а не по разнице в часах: запись в 23:50
  // и запись в 00:10 — разные дни, хотя между ними двадцать минут.
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);

  if (days <= 0) return time;
  if (days === 1) return `вчера, ${time}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]}, ${time}`;
}
