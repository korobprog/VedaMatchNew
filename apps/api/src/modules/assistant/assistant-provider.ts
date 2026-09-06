/**
 * Разбор ответа OpenAI-совместимого провайдера. Чистые функции: формат
 * `chat/completions` с tool calling проверяется тестом на записанных ответах,
 * а не на живом ключе.
 */

export interface ProviderToolCall {
  id: string;
  name: string;
  /** Аргументы как прислала модель — строка JSON, разбирается позже. */
  arguments: string;
}

export interface ProviderUsage {
  tokensIn: number;
  tokensOut: number;
}

export interface ParsedCompletion {
  content: string;
  toolCalls: ProviderToolCall[];
  usage: ProviderUsage;
}

export class ProviderResponseError extends Error {}

interface RawToolCall {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

export function parseCompletion(payload: unknown): ParsedCompletion {
  const body = (payload ?? {}) as {
    choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const message = body.choices?.[0]?.message;
  if (!message)
    throw new ProviderResponseError('Провайдер вернул пустой ответ');

  const content = typeof message.content === 'string' ? message.content : '';
  const rawCalls = Array.isArray(message.tool_calls)
    ? (message.tool_calls as RawToolCall[])
    : [];
  const toolCalls: ProviderToolCall[] = [];
  for (const call of rawCalls) {
    const name = call.function?.name;
    if (typeof name !== 'string' || !name) continue;
    const args = call.function?.arguments;
    toolCalls.push({
      id:
        typeof call.id === 'string' && call.id
          ? call.id
          : `call_${toolCalls.length}`,
      name,
      arguments:
        typeof args === 'string'
          ? args
          : args && typeof args === 'object'
            ? JSON.stringify(args)
            : '{}',
    });
  }
  if (!content.trim() && toolCalls.length === 0)
    throw new ProviderResponseError('Провайдер вернул пустой ответ');

  return {
    content,
    toolCalls,
    usage: {
      tokensIn: toInt(body.usage?.prompt_tokens),
      tokensOut: toInt(body.usage?.completion_tokens),
    },
  };
}

/** Аргументы вызова: невалидный JSON — пустой объект, дальше решает реестр. */
export function parseToolCallArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

/**
 * Настройки провайдера: свои переменные, а за неимением — те же, что у
 * Вдохновения. Один ключ релея обслуживает оба сервиса, и просить
 * администратора вписать его дважды незачем.
 */
export function resolveProviderConfig(env: {
  ASSISTANT_AI_BASE_URL?: string;
  ASSISTANT_AI_API_KEY?: string;
  ASSISTANT_TEXT_MODEL?: string;
  MOTIVATION_AI_BASE_URL?: string;
  MOTIVATION_AI_API_KEY?: string;
  MOTIVATION_TEXT_MODEL?: string;
}): { baseUrl: string; apiKey: string; model: string } | null {
  const baseUrl = (
    env.ASSISTANT_AI_BASE_URL ||
    env.MOTIVATION_AI_BASE_URL ||
    ''
  ).replace(/\/$/, '');
  const apiKey = env.ASSISTANT_AI_API_KEY || env.MOTIVATION_AI_API_KEY || '';
  if (!baseUrl || !apiKey) return null;
  const model =
    env.ASSISTANT_TEXT_MODEL || env.MOTIVATION_TEXT_MODEL || 'gpt-5.4-mini';
  return { baseUrl, apiKey, model };
}
