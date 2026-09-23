import {
  WELLNESS_INGREDIENTS_RAW_MAX,
  WELLNESS_PRODUCT_BRAND_MAX,
  WELLNESS_PRODUCT_NAME_MAX,
} from '@vedamatch/shared';
import { comparableUrl } from './source-check';

/**
 * Запрос к ИИ, который ищет товар в интернете (VED-384), и разбор ответа —
 * без сети.
 *
 * Поиск делает сам провайдер: релей понимает OpenAI Responses API с
 * инструментом `web_search` (проверено живым вызовом — модель ищет запросом,
 * открывает страницы, и журнал этого приходит в `output`). Модель к решению
 * не допущена: она приносит находку и источники, а принять карточку или нет,
 * решает `check-rule.ts` по тому, что сервер проверил сам.
 */

export interface CheckInput {
  barcode: string;
  name: string;
  brand: string | null;
  ingredientsRaw: string;
  imageDataUrl: string | null;
}

/**
 * Сколько раз модели можно искать и открывать страницы. Каждый вызов
 * инструмента — деньги и десятки тысяч токенов чужих страниц во входе.
 */
export const CHECK_MAX_TOOL_CALLS = 6;
const MAX_OUTPUT_TOKENS = 3000;
const MAX_SOURCES = 8;
const MAX_CONFLICTS = 5;

/**
 * Задание модели. Главная строка — «состав бери со страницы, а не со снимка»:
 * иначе модель вернёт нам наш же текст, и совпадение ничего не докажет.
 */
const PROMPT = [
  'Ты проверяешь карточку продукта питания, которую прислал человек.',
  'Найди этот товар в интернете по штрихкоду и названию: сайт производителя,',
  'открытые базы продуктов (Open Food Facts и подобные), интернет-магазины.',
  'Снимок упаковки и присланный текст нужны, чтобы узнать товар и сравнить,',
  'но состав в ответе бери ТОЛЬКО со страниц, которые открыл, дословно,',
  'на языке страницы. Не переписывай присланный состав и не додумывай.',
  'В источники включай только страницы именно этого товара, которые ты',
  'открыл, а не главные страницы сайтов.',
  'Если товар не нашёлся или ты не уверен, что это он, верни "found": false.',
  'Если источники расходятся между собой или с упаковкой (другой товар,',
  'другой состав, другой производитель), опиши каждое расхождение в "conflicts".',
  'Если по источникам это не еда (косметика, бытовая химия, корм), верни',
  '"notFood": true.',
  'Ответь одним JSON-объектом без пояснений:',
  '{"found": boolean, "notFood": boolean, "name": string, "brand": string,',
  '"ingredients": string, "sources": [{"url": string, "title": string,',
  '"confirmsProduct": boolean, "confirmsIngredients": boolean}],',
  '"conflicts": [string]}',
].join(' ');

export function buildCheckRequest(
  model: string,
  input: CheckInput,
): Record<string, unknown> {
  const facts = [
    `Штрихкод: ${input.barcode}`,
    `Название со слов человека: ${input.name}`,
    input.brand ? `Производитель со слов человека: ${input.brand}` : '',
    `Состав, распознанный со снимка: ${input.ingredientsRaw}`,
  ]
    .filter(Boolean)
    .join('\n');

  const content: Record<string, unknown>[] = [
    { type: 'input_text', text: `${PROMPT}\n\n${facts}` },
  ];
  if (input.imageDataUrl) {
    // `low`: снимок нужен узнать упаковку, а не читать буквы — их уже
    // прочитали при распознавании. Детальная картинка стоит втрое дороже.
    content.push({
      type: 'input_image',
      image_url: input.imageDataUrl,
      detail: 'low',
    });
  }

  return {
    model,
    input: [{ role: 'user', content }],
    tools: [{ type: 'web_search', search_context_size: 'low' }],
    max_tool_calls: CHECK_MAX_TOOL_CALLS,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: 'low' },
  };
}

export interface ClaimedSource {
  url: string;
  title: string;
  confirmsProduct: boolean;
  confirmsIngredients: boolean;
}

export interface CheckProposal {
  found: boolean;
  notFood: boolean;
  name: string | null;
  brand: string | null;
  ingredientsRaw: string | null;
  sources: ClaimedSource[];
  conflicts: string[];
}

export interface ParsedCheckResponse {
  /** `null` — ответ пуст или это не тот JSON, который мы просили. */
  proposal: CheckProposal | null;
  /**
   * Страницы, которые по журналу провайдера открывал поиск. Это факт от
   * провайдера, а не слова модели: по нему источник получает уровень `opened`.
   */
  seenUrls: string[];
  /** Сколько раз модель искала — поиск оплачивается поштучно. */
  searchCalls: number;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Первый JSON-объект в тексте. Модели оборачивают его в ```json, пишут
 * вступление или хвост — всё это отбрасывается; битый JSON — `null`.
 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function parseSources(value: unknown): ClaimedSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sources: ClaimedSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const url = cleanText(raw.url, 500);
    if (!url || !isHttpUrl(url)) continue;
    const key = comparableUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push({
      url,
      title: cleanText(raw.title, 200) ?? '',
      confirmsProduct: raw.confirmsProduct === true,
      confirmsIngredients: raw.confirmsIngredients === true,
    });
    if (sources.length >= MAX_SOURCES) break;
  }
  return sources;
}

/**
 * JSON модели → предложение. Всё, что не того типа, считается отсутствующим,
 * а не угадывается: `"found": "yes"` — не «найдено», строка вместо списка
 * источников — ноль источников.
 */
export function parseProposal(value: unknown): CheckProposal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.found !== 'boolean') return null;
  return {
    found: raw.found,
    notFood: raw.notFood === true,
    name: cleanText(raw.name, WELLNESS_PRODUCT_NAME_MAX),
    brand: cleanText(raw.brand, WELLNESS_PRODUCT_BRAND_MAX),
    ingredientsRaw:
      typeof raw.ingredients === 'string'
        ? raw.ingredients.trim().slice(0, WELLNESS_INGREDIENTS_RAW_MAX) || null
        : null,
    sources: parseSources(raw.sources),
    conflicts: Array.isArray(raw.conflicts)
      ? raw.conflicts
          .map((item) => cleanText(item, 300))
          .filter((item): item is string => Boolean(item))
          .slice(0, MAX_CONFLICTS)
      : [],
  };
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

/**
 * Ответ Responses API целиком. Последнее текстовое сообщение — ответ модели;
 * элементы `web_search_call` — журнал поиска: что искали и какие страницы
 * открывали.
 */
export function parseCheckResponse(payload: unknown): ParsedCheckResponse {
  const body =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const output = Array.isArray(body.output) ? body.output : [];
  const seen = new Set<string>();
  let searchCalls = 0;
  let text = '';

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (entry.type === 'web_search_call') {
      const action = (entry.action ?? {}) as Record<string, unknown>;
      if (action.type === 'search') searchCalls += 1;
      if (typeof action.url === 'string') {
        const key = comparableUrl(action.url);
        if (key) seen.add(key);
      }
      if (Array.isArray(action.sources)) {
        for (const source of action.sources) {
          const url = (source as { url?: unknown } | null)?.url;
          const key = typeof url === 'string' ? comparableUrl(url) : null;
          if (key) seen.add(key);
        }
      }
    }
    if (entry.type === 'message' && Array.isArray(entry.content)) {
      const parts = entry.content
        .map((part) => (part as { text?: unknown } | null)?.text)
        .filter((part): part is string => typeof part === 'string');
      if (parts.length) text = parts.join('\n');
    }
  }

  const usage = (body.usage ?? {}) as Record<string, unknown>;
  return {
    proposal: text ? parseProposal(extractJsonObject(text)) : null,
    seenUrls: [...seen],
    searchCalls,
    usage: {
      inputTokens: count(usage.input_tokens),
      outputTokens: count(usage.output_tokens),
    },
  };
}

/**
 * Провайдер занят, а не сломан: 429, перегрузка канала или «модель
 * перегружена» в теле. Такую попытку не засчитываем — карточка не виновата,
 * что проверять её было некому. В живой пробе релей ответил именно так:
 * `rate_limit_error` с текстом «Выбранная модель сейчас перегружена».
 */
export function isProviderBusy(status: number, body: string): boolean {
  if (status === 429 || status === 503) return true;
  return /rate_limit|overloaded|перегружен/i.test(body);
}
