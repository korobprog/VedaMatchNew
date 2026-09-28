/**
 * «Третий глаз»: кадр с камеры → одна короткая фраза, которую телефон
 * произнесёт вслух человеку с плохим зрением.
 *
 * Здесь только сборка запроса к провайдеру и разбор ответа — без сети, по
 * правилу репозитория: аргументы внешних вызовов собираются отдельным модулем
 * и покрываются тестом.
 *
 * Три режима, и у каждого своё задание, а не одно общее «опиши картинку»:
 * общий промпт на остановке пересказывает небо и скамейку, а человеку нужен
 * номер маршрута — и ничего больше. Узкое задание короче отвечается и
 * быстрее произносится.
 *
 * Ответ — простой текст, а не JSON: модель не тратит время на кавычки, а
 * синтезатору речи всё равно нужна строка. «Ничего подходящего» кодируется
 * одним словом {@link EYE_NOTHING}: в живом режиме телефон шлёт кадр каждые
 * пару секунд, и пустой кадр должен молчать, а не говорить «автобусов не
 * видно» по кругу.
 */

export const EYE_MODES = ['transport', 'shop', 'scene'] as const;
export type EyeMode = (typeof EYE_MODES)[number];

/** Кадр живого режима — не фотоальбом: телефон шлёт ~1280 пикселей. */
export const EYE_IMAGE_MAX_BYTES = 700 * 1024;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** Слово-признак «на кадре нет того, что ищем». */
export const EYE_NOTHING = 'НЕТ';

/** Длиннее человек слушать не станет: фраза должна кончиться раньше автобуса. */
export const EYE_SPEECH_MAX_CHARS = 240;

const COMMON = [
  'Ты — глаза для человека с очень плохим зрением. Он слушает твой ответ через',
  'синтезатор речи, поэтому отвечай по-русски, коротко, простыми словами,',
  'без списков, markdown, эмодзи и вступлений вроде «На снимке видно».',
  'Обращайся на «вы»: «перед вами», а не «перед тобой».',
  'Числа пиши цифрами. Никогда не выдумывай то, что не читается уверенно:',
  'лучше сказать «номер не разобрать», чем назвать неверный.',
  `Если на кадре нет того, что просят, ответь ровно одним словом ${EYE_NOTHING}.`,
].join(' ');

const TASK: Record<EyeMode, string> = {
  transport: [
    'Человек стоит на остановке и ждёт свой транспорт.',
    'Найди на кадре автобус, троллейбус, трамвай, маршрутку или электробус.',
    'Прочитай номер маршрута на табло или на табличке — на лобовом стекле,',
    'над ним или сбоку. Если видно конечную или направление, назови и её.',
    'Формат: «Автобус 47, до Центрального рынка». Буквы в номере сохраняй:',
    '«Троллейбус 5А», «Маршрутка Т12».',
    'Если транспорт есть, а номер не читается, так и скажи:',
    '«Автобус, номер не разобрать».',
    'Если транспортных средств несколько, начни с ближайшего.',
  ].join(' '),
  shop: [
    'Человек в магазине и держит перед камерой товар, полку или ценник.',
    'Скажи, что это за товар: название, марку, вес или объём, жирность или',
    'вкус — то, чем он отличается от соседних.',
    'Если виден ценник, назови цену так, как она написана: «89 рублей 90',
    'копеек»; если на ценнике две цены (обычная и по карте или со скидкой),',
    'назови обе и скажи, какая по карте.',
    'Если товаров несколько, назови тот, что в центре кадра и ближе всего,',
    'и коротко — сколько ещё рядом.',
    'Срок годности называй, только если он виден крупно.',
  ].join(' '),
  scene: [
    'Опиши, что перед человеком, одной-двумя фразами.',
    'Сначала опасное и важное для движения: ступеньки, яму, бордюр,',
    'дверь, препятствие, приближающуюся машину или велосипед;',
    'такую фразу начинай со слова «Осторожно».',
    'Затем — крупные надписи и вывески, если они есть, и где они: слева,',
    'справа, прямо.',
    'Людей описывай без оценок внешности.',
  ].join(' '),
};

export class EyeInputError extends Error {}

export function parseEyeMode(value: unknown): EyeMode {
  if (
    typeof value === 'string' &&
    (EYE_MODES as readonly string[]).includes(value)
  ) {
    return value as EyeMode;
  }
  throw new EyeInputError('Неизвестный режим');
}

/**
 * Проверка кадра. Предел меньше, чем у снимка состава: живой режим шлёт кадр
 * каждые пару секунд, и мегабайтный снимок — это уже ошибка клиента.
 * Глобальный `json`-парсер API всё равно не пропустит тело больше 1 МБ.
 */
export function parseEyeFrame(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('data:')) {
    throw new EyeInputError('Нужен кадр с камеры');
  }
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new EyeInputError('Кадр не распознан');
  const [, mime, payload] = match;
  if (!ALLOWED_MIME.includes(mime)) {
    throw new EyeInputError('Поддерживаются JPEG, PNG и WebP');
  }
  if (Math.floor((payload.length * 3) / 4) > EYE_IMAGE_MAX_BYTES) {
    throw new EyeInputError('Кадр слишком большой');
  }
  return value;
}

/**
 * Что уже было сказано. Модели оно нужно, чтобы не пересказывать тот же
 * автобус другими словами: иначе телефон решит, что фраза новая, и повторит.
 */
export function parsePrevious(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, EYE_SPEECH_MAX_CHARS);
  return text || null;
}

export interface EyeRequestBody {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: (
    | { role: 'system'; content: string }
    | {
        role: 'user';
        content: (
          | { type: 'text'; text: string }
          | {
              type: 'image_url';
              image_url: { url: string; detail: 'low' | 'high' };
            }
        )[];
      }
  )[];
}

export function buildEyeRequest(
  model: string,
  mode: EyeMode,
  imageDataUrl: string,
  previous: string | null,
): EyeRequestBody {
  const hint = previous
    ? `Перед этим ты сказал: «${previous}». Если на кадре то же самое, повтори эту фразу слово в слово.`
    : '';
  return {
    model,
    temperature: 0,
    // Фраза на 2–3 секунды речи. Потолок держит и задержку: модель не
    // разгоняется на абзац.
    max_tokens: 120,
    messages: [
      { role: 'system', content: COMMON },
      {
        role: 'user',
        content: [
          { type: 'text', text: [TASK[mode], hint].filter(Boolean).join(' ') },
          {
            type: 'image_url',
            // Номер маршрута и цифры ценника — мелкие детали на расстоянии:
            // на `low` модель видит картинку ужатой до 512 пикселей, и номер
            // автобуса через дорогу превращается в пятно. Обзор сцены мелочей
            // не требует — там экономим.
            image_url: {
              url: imageDataUrl,
              detail: mode === 'scene' ? 'low' : 'high',
            },
          },
        ],
      },
    ],
  };
}

export interface EyeAnswer {
  /** Фраза для синтезатора речи. Пустая — говорить нечего. */
  speech: string;
  /** На кадре нет того, что ищем: живой режим молчит. */
  nothing: boolean;
}

/**
 * Разбор ответа провайдера. Всё, что не похоже на фразу, — «ничего»: пустой
 * или сломанный ответ не должен превращаться в ошибку на экране, живой режим
 * просто попробует следующий кадр.
 */
export function parseEyeResponse(payload: unknown): EyeAnswer {
  const choices = (payload as { choices?: unknown })?.choices;
  const content = Array.isArray(choices)
    ? (choices[0] as { message?: { content?: unknown } } | undefined)?.message
        ?.content
    : undefined;
  if (typeof content !== 'string') return { speech: '', nothing: true };
  const speech = cleanSpeech(content);
  if (!speech || isNothing(speech)) return { speech: '', nothing: true };
  return { speech, nothing: false };
}

function isNothing(text: string): boolean {
  return (
    text
      .replace(/[.!«»"]/g, '')
      .trim()
      .toUpperCase() === EYE_NOTHING
  );
}

/**
 * Синтезатор читает звёздочки и решётки вслух — «звёздочка звёздочка автобус».
 * Разметку срезаем, строки склеиваем, длину ограничиваем по концу фразы.
 */
export function cleanSpeech(raw: string): string {
  const flat = raw
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= EYE_SPEECH_MAX_CHARS) return flat;
  const cut = flat.slice(0, EYE_SPEECH_MAX_CHARS);
  const end = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  );
  return end > 40
    ? cut.slice(0, end + 1)
    : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
