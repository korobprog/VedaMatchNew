/**
 * Реестр инструментов ассистента.
 *
 * Ассистент знает, ЧТО можно спросить у сервисов и в какой форме, но не знает,
 * КАК сервис это ищет: у каждого инструмента есть событие, а отвечает на него
 * слушатель внутри модуля-владельца. Имена — с подчёркиванием, а не с точкой:
 * OpenAI-совместимые провайдеры принимают в имени функции только
 * `[a-zA-Z0-9_-]`.
 *
 * Чистый модуль без Nest: реестр и разбор аргументов покрываются тестом.
 */

export type AssistantToolName =
  | 'market_search'
  | 'notices_search'
  | 'motivation_search'
  | 'motivation_create_reel'
  | 'library_search'
  | 'music_search'
  | 'vedabase_search'
  | 'astro_status';

export interface AssistantToolDefinition {
  name: AssistantToolName;
  /** Слаг сервиса-владельца — для метрик и подписи карточек. */
  service: string;
  description: string;
  /** JSON Schema аргументов в формате function calling. */
  parameters: Record<string, unknown>;
  /**
   * Действие, а не поиск: выполняется только после подтверждения человека
   * кнопкой в чате. Модель получает «ждём подтверждения», а не результат.
   */
  requiresConfirmation: boolean;
  /** Подпись кнопки подтверждения; только у действий. */
  confirmLabel?: string;
}

export const MAX_TOOL_ITEMS = 8;
const DEFAULT_TOOL_ITEMS = 5;
const MAX_QUERY_LENGTH = 200;
const MAX_REEL_TEXT = 600;
const MIN_REEL_TEXT = 12;
const MAX_REEL_EXPLANATION = 800;

const searchParameters = (extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Что искать, по-русски или по-английски, 1–5 слов',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_TOOL_ITEMS,
      description: `Сколько результатов вернуть, по умолчанию ${DEFAULT_TOOL_ITEMS}`,
    },
    ...extra,
  },
  required: ['query'],
});

export const ASSISTANT_TOOLS: readonly AssistantToolDefinition[] = [
  {
    name: 'market_search',
    service: 'market',
    description:
      'Поиск товаров и услуг на Рынке VedaMatch: книги, одежда, атрибутика, мастерские, консультации. Возвращает карточки с ценой, фото и ссылкой.',
    parameters: searchParameters({
      kind: {
        type: 'string',
        enum: ['product', 'service'],
        description: 'Только товары или только услуги; пусто — всё',
      },
      city: {
        type: 'string',
        description: 'Город, если человек его назвал',
      },
    }),
    requiresConfirmation: false,
  },
  {
    name: 'notices_search',
    service: 'notices',
    description:
      'Поиск по доске некоммерческих Объявлений: отдам даром, нужны руки, попутчики, программы и события ятр.',
    parameters: searchParameters({
      kind: {
        type: 'string',
        enum: ['offer', 'request', 'event', 'info'],
        description: 'Вид объявления; пусто — любое',
      },
      city: { type: 'string', description: 'Город, если назван' },
    }),
    requiresConfirmation: false,
  },
  {
    name: 'motivation_search',
    service: 'motivation',
    description:
      'Поиск цитат, афоризмов и размышлений в сервисе Вдохновение по словам, автору или теме.',
    parameters: searchParameters(),
    requiresConfirmation: false,
  },
  {
    name: 'motivation_create_reel',
    service: 'motivation',
    description:
      'Создать рилс во Вдохновении от имени пользователя: текст цитаты или размышления, к нему сервис сам нарисует картинку. Вызывай только когда человек прямо попросил опубликовать; текст сначала согласуй с ним в переписке. Действие выполняется после подтверждения кнопкой.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: `Текст цитаты или размышления, ${MIN_REEL_TEXT}–${MAX_REEL_TEXT} символов`,
        },
        explanation: {
          type: 'string',
          description: 'Необязательное пояснение под цитатой',
        },
        author: {
          type: 'string',
          description:
            'Автор цитаты, если это чья-то цитата; пусто — своя мысль',
        },
        audienceTrack: {
          type: 'string',
          enum: ['universal', 'vaishnava'],
          description:
            'Поток: universal — общечеловеческое, vaishnava — вайшнавское',
        },
      },
      required: ['text'],
    },
    requiresConfirmation: true,
    confirmLabel: 'Опубликовать во Вдохновении',
  },
  {
    name: 'library_search',
    service: 'library',
    description:
      'Поиск учебных материалов в сервисе Образование: статьи, видео, книги, курсы, каналы.',
    parameters: searchParameters({
      type: {
        type: 'string',
        enum: ['article', 'video', 'audio', 'book', 'course', 'website'],
        description: 'Тип материала; пусто — любой',
      },
    }),
    requiresConfirmation: false,
  },
  {
    name: 'music_search',
    service: 'music',
    description:
      'Поиск киртанов, бхаджанов и лекций в сервисе Музыка по названию или исполнителю.',
    parameters: searchParameters(),
    requiresConfirmation: false,
  },
  {
    name: 'vedabase_search',
    service: 'vedabase',
    description:
      'Поиск по текстам Библиотеки писаний (Бхагавад-гита, Шримад-Бхагаватам и другие книги): стихи и комментарии по словам.',
    parameters: searchParameters(),
    requiresConfirmation: false,
  },
  {
    name: 'astro_status',
    service: 'astro',
    description:
      'Узнать, заполнены ли у человека данные рождения в сервисе Астрология и куда идти за картой, разбором или совместимостью. Расчёты не делает.',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
  },
];

const byName = new Map(ASSISTANT_TOOLS.map((tool) => [tool.name, tool]));

export function toolByName(name: string): AssistantToolDefinition | undefined {
  return byName.get(name as AssistantToolName);
}

/** Имя события шины для инструмента. Дублируется в слушателях сервисов. */
export function toolEventName(name: string): string {
  return `assistant.tool.${name}`;
}

/** Описания в формате function calling OpenAI-совместимых провайдеров. */
export function toProviderTools(
  tools: readonly AssistantToolDefinition[] = ASSISTANT_TOOLS,
  options: { actionsEnabled: boolean } = { actionsEnabled: true },
): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return tools
    .filter((tool) => options.actionsEnabled || !tool.requiresConfirmation)
    .map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
}

export class ToolArgsError extends Error {}

function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function cleanEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Разбор аргументов от модели. Модель может прислать что угодно — лишние поля,
 * строку вместо числа, пустой запрос, — и всё это должно превратиться либо в
 * чистые аргументы, либо в понятную ошибку, которую модель прочтёт и исправит.
 */
export function parseToolArgs(
  tool: AssistantToolDefinition,
  raw: unknown,
): Record<string, unknown> {
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  if (tool.name === 'astro_status') return {};

  if (tool.name === 'motivation_create_reel') {
    const text = cleanString(input.text, MAX_REEL_TEXT * 2);
    if (!text || text.length < MIN_REEL_TEXT)
      throw new ToolArgsError(
        `Поле text обязательно, не короче ${MIN_REEL_TEXT} символов`,
      );
    if (text.length > MAX_REEL_TEXT)
      throw new ToolArgsError(
        `Текст длиннее ${MAX_REEL_TEXT} символов — сократи его`,
      );
    const explanation = cleanString(input.explanation, MAX_REEL_EXPLANATION);
    const author = cleanString(input.author, 80);
    const audienceTrack =
      cleanEnum(input.audienceTrack, ['universal', 'vaishnava'] as const) ??
      'universal';
    return {
      text,
      ...(explanation ? { explanation } : {}),
      ...(author ? { author } : {}),
      audienceTrack,
    };
  }

  const query = cleanString(input.query, MAX_QUERY_LENGTH);
  if (!query) throw new ToolArgsError('Поле query обязательно');
  const limitRaw = Number(input.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_TOOL_ITEMS, Math.max(1, Math.trunc(limitRaw)))
    : DEFAULT_TOOL_ITEMS;
  const args: Record<string, unknown> = { query, limit };

  const city = cleanString(input.city, 80);
  if (city && (tool.name === 'market_search' || tool.name === 'notices_search'))
    args.city = city;
  if (tool.name === 'market_search') {
    const kind = cleanEnum(input.kind, ['product', 'service'] as const);
    if (kind) args.kind = kind;
  }
  if (tool.name === 'notices_search') {
    const kind = cleanEnum(input.kind, [
      'offer',
      'request',
      'event',
      'info',
    ] as const);
    if (kind) args.kind = kind;
  }
  if (tool.name === 'library_search') {
    const type = cleanEnum(input.type, [
      'article',
      'video',
      'audio',
      'book',
      'course',
      'website',
    ] as const);
    if (type) args.type = type;
  }
  return args;
}
