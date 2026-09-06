/**
 * История беседы для модели и служебные мелочи переписки. Чистые функции.
 */

export interface StoredMessage {
  role: 'user' | 'assistant';
  text: string;
  failed: boolean;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/** Сколько прошлых реплик уходит модели: длинная нить — дорогой запрос. */
export const HISTORY_LIMIT = 16;
const HISTORY_CHAR_BUDGET = 12_000;
export const MAX_QUESTION_LENGTH = 2_000;
const TITLE_LENGTH = 60;

/**
 * Последние реплики, уложенные в бюджет символов. Неудавшиеся ответы
 * ассистента пропускаются: «провайдер не ответил» — не часть разговора.
 */
export function historyForModel(
  messages: readonly StoredMessage[],
  limit = HISTORY_LIMIT,
): ModelMessage[] {
  const picked: ModelMessage[] = [];
  let budget = HISTORY_CHAR_BUDGET;
  for (let i = messages.length - 1; i >= 0 && picked.length < limit; i -= 1) {
    const message = messages[i];
    if (message.failed) continue;
    const content = message.text.trim();
    if (!content) continue;
    if (content.length > budget) break;
    budget -= content.length;
    picked.push({ role: message.role, content });
  }
  return picked.reverse();
}

/** Заголовок нити — первые слова первого вопроса. */
export function titleFrom(text: string): string {
  const flat = text.trim().replace(/\s+/g, ' ');
  if (flat.length <= TITLE_LENGTH) return flat;
  const cut = flat.slice(0, TITLE_LENGTH);
  const space = cut.lastIndexOf(' ');
  return `${space > TITLE_LENGTH / 2 ? cut.slice(0, space) : cut}…`;
}

/** Вопрос человека: пустой или запредельно длинный — ошибка до запроса к модели. */
export function normalizeQuestion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_QUESTION_LENGTH
    ? trimmed.slice(0, MAX_QUESTION_LENGTH)
    : trimmed;
}

/** Ответ помощника переписки: без обрамляющих кавычек, которые любят модели. */
export function cleanComposedText(raw: string): string {
  let text = raw.trim();
  const quoted =
    (text.startsWith('«') && text.endsWith('»')) ||
    (text.startsWith('"') && text.endsWith('"'));
  if (quoted && text.length > 2) text = text.slice(1, -1).trim();
  return text;
}
