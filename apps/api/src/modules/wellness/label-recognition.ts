/**
 * Снимок этикетки → строка состава.
 *
 * Здесь только сборка запроса к провайдеру и разбор ответа — без сети.
 * Правило репозитория: аргументы внешних вызовов собираются отдельным
 * модулем и покрываются тестом, иначе ошибка в теле запроса видна только на
 * проде и только по пустому ответу.
 *
 * Модель делает ровно одно: читает буквы с картинки. Решение о том, подходит
 * ли продукт, принимает наш детерминированный код — модель к вердикту не
 * допущена.
 */

/** Больше 4 МБ в base64 — это уже не этикетка, а фотоальбом. */
export const LABEL_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Задание модели. Отдельная строка про следы — не вежливость: без неё обе
 * проверенные модели выбрасывали «Может содержать следы рыбы» как не часть
 * состава, а это ровно то предупреждение, ради которого сервис и нужен.
 */
const PROMPT = [
  'На снимке — упаковка продукта питания.',
  'Верни текст состава: то, что напечатано после слова «Состав»,',
  '«Ингредиенты» или «Ingredients».',
  'Обязательно добавь в конце предложение про следы, если оно есть на упаковке:',
  '«может содержать следы…», «производится на оборудовании…» и подобные.',
  'Сохрани порядок, скобки и проценты как на упаковке.',
  'Ничего не переводи, не сокращай и не дополняй от себя.',
  'Если состава на снимке не видно, верни пустую строку.',
].join(' ');

export class LabelImageError extends Error {}

/**
 * Проверка data-URL со снимком. Отдельно от сборки запроса: картинку присылает
 * браузер, и доверять её заголовку нельзя.
 */
export function parseImageDataUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('data:')) {
    throw new LabelImageError('Нужен снимок этикетки');
  }
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new LabelImageError('Снимок не распознан');
  const [, mime, payload] = match;
  if (!ALLOWED_MIME.includes(mime)) {
    throw new LabelImageError('Поддерживаются JPEG, PNG и WebP');
  }
  // Длина base64 → размер: каждые 4 символа дают 3 байта.
  const bytes = Math.floor((payload.length * 3) / 4);
  if (bytes > LABEL_IMAGE_MAX_BYTES) {
    throw new LabelImageError('Снимок слишком большой, переснимите поближе');
  }
  return value;
}

export interface LabelRequestBody {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: {
    role: 'user';
    content: (
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    )[];
  }[];
}

export function buildLabelRequest(
  model: string,
  imageDataUrl: string,
): LabelRequestBody {
  return {
    model,
    // Ноль: это чтение букв с картинки, выдумывать здесь нечего.
    temperature: 0,
    max_tokens: 700,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  };
}

/**
 * Ответ провайдера. Пустая строка — законный исход: состава на снимке не
 * видно, и притворяться, что видно, нельзя.
 */
export function parseLabelResponse(payload: unknown): string {
  const choices = (payload as { choices?: unknown })?.choices;
  if (!Array.isArray(choices) || !choices.length) return '';
  const content = (
    choices[0] as { message?: { content?: unknown } } | undefined
  )?.message?.content;
  if (typeof content !== 'string') return '';
  return content
    .replace(/^\s*(состав|ингредиенты|ingredients)\s*[:.]\s*/i, '')
    .replace(/^["'«»]+|["'«»]+$/g, '')
    .trim();
}
