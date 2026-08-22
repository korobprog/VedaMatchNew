/**
 * Время в списке бесед: часы для сегодняшнего, «вчера», день недели на этой
 * неделе и дата для остального. Отдельным модулем — правило проверяется
 * тестом, а компонент вокруг него не тестируется.
 */
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function formatChatStamp(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const startOfToday = startOfDay(now);
  const startOfDate = startOfDay(date);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );

  if (dayDiff <= 0) return time(date);
  if (dayDiff === 1) return "вчера";
  if (dayDiff < 7) return WEEKDAYS[date.getDay()];
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/** Разделитель в переписке: «Сегодня», «Вчера» или дата. */
export function formatChatDivider(
  iso: string,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  const dayDiff = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (dayDiff <= 0) return "Сегодня";
  if (dayDiff === 1) return "Вчера";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function time(date: Date): string {
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Длительность голосового: 0:24, 1:05. */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/** Размер файла человеческими единицами. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
