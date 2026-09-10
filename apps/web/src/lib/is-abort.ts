/**
 * Отменённый запрос — не ошибка.
 *
 * React в разработке монтирует эффект дважды: первый `AbortController`
 * срабатывает на размонтировании, и его отказ приходит в тот же `catch`, что и
 * настоящий сбой сети. Без этой проверки на экране висит «не удалось
 * загрузить» поверх успешно загруженных данных.
 *
 * Живёт в `lib`, а не внутри сервиса: одна и та же ловушка встречает каждый
 * экран, который грузит данные эффектом, а компоненты чужого сервиса
 * импортировать нельзя.
 *
 * Форма отказа разная: в браузере это `DOMException`, в jsdom и node —
 * обычный объект с тем же именем.
 */
export function isAbort(cause: unknown): boolean {
  if (typeof DOMException !== "undefined" && cause instanceof DOMException) {
    return cause.name === "AbortError";
  }
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "AbortError"
  );
}
