/**
 * Пояснение хранится в `post.text` склеенным с цитатой через пустую строку
 * (см. `motivation-copy.service.ts`). И админская карточка, и лента показывают
 * цитату всегда, а пояснение — отдельным сворачиваемым блоком.
 */
export function splitQuoteAndExplanation(text: string): {
  quote: string;
  explanation: string;
} {
  const separator = text.indexOf("\n\n");
  if (separator === -1) return { quote: text.trim(), explanation: "" };
  return {
    quote: text.slice(0, separator).trim(),
    explanation: text.slice(separator + 2).trim(),
  };
}

/**
 * Примерная граница в символах — не точный расчёт переноса строк (шрифт и
 * ширина экрана у ленты и у кадра ролика разные), а прикидка «похоже, не
 * поместится в 4 строки», по той же логике, что estimateReadingSeconds на
 * бэкенде: приблизительно, но достаточно, чтобы решить, показывать кнопку.
 */
const LONG_QUOTE_CHARS = 170;

export function isLongQuote(text: string): boolean {
  return text.trim().length > LONG_QUOTE_CHARS;
}
