import { plural } from "@/lib/plural";

/**
 * Подписи времени в карточке ленты. Отдельный чистый модуль, чтобы формат
 * даты и счёт «сколько осталось в ленте» проверялись тестом, а не глазами
 * внутри разметки.
 */

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/**
 * Дата поста человеческим языком. Год показываем только у прошлогодних:
 * в ленте, где почти всё свежее, «2026» рядом с каждым постом — шум.
 */
export function blogPostDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getFullYear() !== now.getFullYear()) {
    return `${day} ${month} ${date.getFullYear()}`;
  }
  return `${day} ${month}, ${time}`;
}

/**
 * Сколько посту осталось в ленте. `null` — подписи нет: либо срока нет
 * вовсе, либо он уже вышел и пост живёт в архиве, где счётчик бессмыслен.
 */
export function blogFeedCountdown(
  feedUntil: string | null,
  now: Date = new Date(),
): string | null {
  if (!feedUntil) return null;
  const until = new Date(feedUntil);
  if (Number.isNaN(until.getTime())) return null;
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return null;

  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours < 24) {
    return `в ленте ещё ${hours} ${plural(hours, "час", "часа", "часов")}`;
  }
  const days = Math.ceil(hours / 24);
  return `в ленте ещё ${days} ${plural(days, "день", "дня", "дней")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
