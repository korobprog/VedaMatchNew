/**
 * Отменённый запрос — не ошибка.
 *
 * React в разработке монтирует эффект дважды: первый `AbortController`
 * срабатывает на размонтировании, и его отказ приходит в тот же `catch`, что и
 * настоящий сбой сети. Без этой проверки на экране висит «не удалось
 * загрузить» поверх успешно загруженных данных.
 */
export function isAbort(cause: unknown): boolean {
  if (cause instanceof DOMException) return cause.name === "AbortError";
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "AbortError"
  );
}
