/**
 * Текст отказа действия чата — для показа человеку.
 *
 * `send()` из `lib/chat-client` уже достаёт поле `message` из ответа Nest,
 * поэтому у отказа API текст русский и готов к показу как есть («Вы не
 * владелец беседы», «Беседа не найдена»). Сбой сети приходит не оттуда:
 * `fetch` бросает `TypeError` с англоязычным «Failed to fetch», и показывать
 * это человеку нельзя — он увидит техническую строку вместо объяснения.
 *
 * Запасной текст задаёт вызывающий: он один знает, что именно не получилось.
 */

/** Сообщения браузеров об оборванном запросе — их человеку не показываем. */
const NETWORK_MARKERS = [
  "failed to fetch",
  "load failed",
  "networkerror",
  "network request failed",
  "fetch failed",
];

export const CHAT_NETWORK_ERROR =
  "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.";

export function chatActionErrorMessage(
  error: unknown,
  fallback = "Не получилось. Попробуйте ещё раз.",
): string {
  if (!(error instanceof Error)) return fallback;

  const message = error.message.trim();
  if (!message) return fallback;

  const lower = message.toLowerCase();
  if (
    error instanceof TypeError ||
    NETWORK_MARKERS.some((marker) => lower.includes(marker))
  )
    return CHAT_NETWORK_ERROR;

  return message;
}
