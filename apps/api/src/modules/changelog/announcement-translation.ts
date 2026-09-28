/**
 * Автоперевод новости на английский (VED-144). Чистые функции: настройки
 * провайдера, тело запроса `chat/completions` и разбор ответа проверяются
 * тестом без сети. Сетевой вызов — в announcement-translation.service.ts.
 *
 * Провайдер тот же OpenAI-совместимый релей, что у Вдохновения и Помощника.
 * Хелпер продублирован здесь, а не импортирован: контракт сервисного модуля
 * запрещает тянуть код из чужих модулей.
 */

/** Предел входа: новость — это абзац-другой, а не статья. */
export const ANNOUNCEMENT_TRANSLATION_MAX_TITLE = 300;
export const ANNOUNCEMENT_TRANSLATION_MAX_BODY = 8000;

export class AnnouncementTranslationError extends Error {}

export interface TranslationProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Свои переменные `CHANGELOG_AI_*`, а за неимением — те же, что у
 * Вдохновения: один ключ релея обслуживает все сервисы, и вписывать его
 * отдельно для новостей незачем. Модель по умолчанию — та же, что в
 * `.env.example` у Вдохновения и Помощника.
 */
export function resolveTranslationProviderConfig(env: {
  CHANGELOG_AI_BASE_URL?: string;
  CHANGELOG_AI_API_KEY?: string;
  CHANGELOG_TEXT_MODEL?: string;
  MOTIVATION_AI_BASE_URL?: string;
  MOTIVATION_AI_API_KEY?: string;
  MOTIVATION_TEXT_MODEL?: string;
}): TranslationProviderConfig | null {
  const baseUrl = (
    env.CHANGELOG_AI_BASE_URL ||
    env.MOTIVATION_AI_BASE_URL ||
    ''
  ).replace(/\/+$/, '');
  const apiKey = env.CHANGELOG_AI_API_KEY || env.MOTIVATION_AI_API_KEY || '';
  if (!baseUrl || !apiKey) return null;
  const model =
    env.CHANGELOG_TEXT_MODEL || env.MOTIVATION_TEXT_MODEL || 'gpt-5.4-mini';
  return { baseUrl, apiKey, model };
}

export interface AnnouncementTranslationInput {
  titleRu: string;
  bodyRu: string;
}

export interface AnnouncementTranslationOutput {
  titleEn: string;
  bodyEn: string;
}

/** Проверка входа до похода к провайдеру: пустое переводить нечего. */
export function normalizeTranslationInput(
  raw: unknown,
): AnnouncementTranslationInput {
  const body = (raw ?? {}) as { titleRu?: unknown; bodyRu?: unknown };
  const titleRu = typeof body.titleRu === 'string' ? body.titleRu.trim() : '';
  const bodyRu = typeof body.bodyRu === 'string' ? body.bodyRu.trim() : '';
  if (!titleRu && !bodyRu)
    throw new AnnouncementTranslationError(
      'Заполните заголовок или текст на русском — переводить нечего',
    );
  if (titleRu.length > ANNOUNCEMENT_TRANSLATION_MAX_TITLE)
    throw new AnnouncementTranslationError(
      `Заголовок длиннее ${ANNOUNCEMENT_TRANSLATION_MAX_TITLE} символов`,
    );
  if (bodyRu.length > ANNOUNCEMENT_TRANSLATION_MAX_BODY)
    throw new AnnouncementTranslationError(
      `Текст длиннее ${ANNOUNCEMENT_TRANSLATION_MAX_BODY} символов`,
    );
  return { titleRu, bodyRu };
}

const SYSTEM_PROMPT = [
  'You translate news posts of VedaMatch, a portal for the Vaishnava community, from Russian into English.',
  'Translate faithfully and naturally; do not add, drop or explain anything.',
  'Keep line breaks, Markdown, links, emoji, numbers and product names exactly as they are.',
  'Write Sanskrit terms and spiritual names in their common English spelling (e.g. Krishna, Prabhupada, bhakti).',
  'The service name "VedaMatch" is never translated.',
  'Return only a JSON object {"titleEn": string, "bodyEn": string}. An empty source field gives an empty string.',
].join(' ');

/** Тело запроса `POST {baseUrl}/chat/completions`. */
export function buildAnnouncementTranslationRequest(
  input: AnnouncementTranslationInput,
  model: string,
) {
  return {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          titleRu: input.titleRu,
          bodyRu: input.bodyRu,
        }),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  };
}

/**
 * Разбор ответа. JSON в обёртке блока кода распаковывается: не все модели
 * релея держат `response_format`. Пустой перевод непустого поля — ошибка,
 * а не тихо пустое поле в форме.
 */
export function parseAnnouncementTranslation(
  payload: unknown,
  input: AnnouncementTranslationInput,
): AnnouncementTranslationOutput {
  const content = (
    payload as { choices?: Array<{ message?: { content?: unknown } }> } | null
  )?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim())
    throw new AnnouncementTranslationError('Переводчик вернул пустой ответ');

  const unwrapped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    throw new AnnouncementTranslationError('Переводчик вернул не JSON');
  }
  const record = (parsed ?? {}) as { titleEn?: unknown; bodyEn?: unknown };
  const titleEn =
    typeof record.titleEn === 'string' ? record.titleEn.trim() : '';
  const bodyEn = typeof record.bodyEn === 'string' ? record.bodyEn.trim() : '';
  if ((input.titleRu && !titleEn) || (input.bodyRu && !bodyEn))
    throw new AnnouncementTranslationError('Переводчик вернул неполный ответ');
  return { titleEn, bodyEn };
}
