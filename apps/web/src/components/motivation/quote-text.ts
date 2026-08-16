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
