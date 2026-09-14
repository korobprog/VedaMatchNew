/**
 * Текст из ответа модели. Промпт просит {"text": "..."}, но модель отвечает
 * по-разному: чистым JSON, простым текстом, а иногда оборачивает JSON в блок
 * кода ```json … ```. Последний случай раньше проваливался в «простой текст» и
 * уходил в кэш вместе с обёрткой — на главной в карточке «Персональный день»
 * человек видел сырой JSON.
 *
 * null — ответ похож на JSON, но текста из него не достать (оборван, другой
 * ключ). Такой ответ нельзя ни показывать, ни класть в кэш.
 *
 * Той же функцией читаются уже сохранённые тексты: строки, закэшированные до
 * исправления, лечатся при чтении, без правки базы руками.
 *
 * Снятие обёртки повторяет motivation/chat-json.ts: модуль не импортирует
 * чужой сервис, общий хелпер дублируется (docs/service-module-contract.md).
 */
export function extractGeneratedText(content: string): string | null {
  const body = unfence(content.trim());
  if (!body) return null;
  if (!body.startsWith('{')) return body;

  try {
    const parsed = JSON.parse(body) as { text?: unknown } | null;
    const text =
      parsed && typeof parsed.text === 'string' ? parsed.text.trim() : '';
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Снимает обёртку блока кода. Закрывающая черта может отсутствовать — ответ
 * оборвался по лимиту; тогда внутри неполный JSON, и его отсеет разбор выше.
 */
function unfence(text: string): string {
  if (!text.startsWith('```')) return text;
  return text
    .replace(/^```[\w-]*[ \t]*/, '')
    .replace(/```$/, '')
    .trim();
}
