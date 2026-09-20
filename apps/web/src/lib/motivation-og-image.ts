/**
 * Картинка для превью ссылки на афоризм в мессенджерах (VED-201).
 *
 * В `og:image` когда-то стоял сам сторис-кадр: PNG 1080×1920 весом около 5 МБ.
 * Max такой разворачивает, остальные — нет. WhatsApp молча пропускает
 * картинку тяжелее ~300 КБ, Telegram и ВКонтакте тоже режут крупные файлы и
 * не любят PNG такого веса. Поэтому превью отдаётся отдельным адресом —
 * уменьшенным JPEG, который гарантированно укладывается в предел.
 *
 * Второй заход по той же карточке. Кадр собирался жёстко под 9:16 с
 * `fit: 'cover'`, и это годилось только сторис — они уже вертикальные. А
 * открытка, которую человек принёс готовым файлом, приходит любой формы: у
 * квадратной обрезались бока, у горизонтальной — почти всё, и в мессенджер
 * уезжала середина картинки с обрубленной надписью. Отсюда «открытки
 * отображаются урезанными» в карточке.
 *
 * Теперь кадр повторяет пропорции исходника: картинка вписывается целиком
 * (`fit: 'inside'`), ничего не обрезается, а снизу добавляется полоса с
 * подписью бренда (`motivation-og-brand.ts`) — второй пункт той же карточки,
 * «нет подписи скачано в VedaMatch с логотипом».
 *
 * Здесь только чистая часть: раскладка, лестница качества и адрес. Само
 * перекодирование — в маршруте `/m/[slug]/og`.
 */

export const OG_IMAGE_TYPE = "image/jpeg";

/**
 * Границы кадра. Ширина — чтобы превью не весило лишнего, высота — чтобы
 * сторис 9:16 не уезжала в мессенджере полосой на весь экран.
 */
export const OG_PREVIEW_MAX_WIDTH = 1080;
export const OG_PREVIEW_MAX_HEIGHT = 1350;

/**
 * Нижняя граница ширины. Картинку меньше этого слегка растягиваем: иначе
 * полоса с подписью выходит нечитаемой, а Telegram мелкое превью показывает
 * значком сбоку вместо большой карточки.
 */
export const OG_PREVIEW_MIN_WIDTH = 600;

/**
 * Предел веса. WhatsApp — самый строгий из адресатов: всё, что тяжелее
 * примерно 300 КБ, он в карточку не ставит. Берём с запасом.
 */
export const OG_IMAGE_MAX_BYTES = 280_000;

/** Пропорции полосы с подписью — те же, что у самой полосы. */
const FOOTER_ASPECT = 2160 / 208;

export type OgEncoding = {
  /** Доля от полного кадра: 1 — как посчитала раскладка. */
  scale: number;
  quality: number;
};

/**
 * Попытки кодирования по порядку: сначала снижаем качество, затем — если
 * картинка очень пёстрая и всё равно не влезла — размер кадра. Последняя
 * ступень отдаётся в любом случае: лёгкое превью лучше, чем никакого.
 */
export const OG_IMAGE_ATTEMPTS: readonly OgEncoding[] = [
  { scale: 1, quality: 82 },
  { scale: 1, quality: 72 },
  { scale: 1, quality: 62 },
  { scale: 0.8, quality: 62 },
  { scale: 0.62, quality: 55 },
];

export interface OgPreviewBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface OgPreviewLayout {
  /** Весь кадр вместе с полосой. */
  width: number;
  height: number;
  /** Куда ложится сама картинка — целиком, без обрезки. */
  picture: OgPreviewBox;
  /** Полоса с подписью бренда снизу; нулевой высоты — полосы нет. */
  footer: OgPreviewBox;
}

/**
 * Нужна ли полоса с подписью бренда.
 *
 * Только там, где на самой картинке нашей подписи нет. У сторис-кадра рилса
 * её рисует `composeStoryImage()` в API — знак и строка «Создано нейросетью
 * в VedaMatch» уже внизу кадра, и вторая полоса дала бы два логотипа подряд.
 * Ровно на путаницу со знаком в этом кадре владелец жаловался по VED-227,
 * второй раз её устраивать незачем.
 *
 * А открытка (`captionInImage`) приходит готовым файлом, нашего знака на ней
 * нет вовсе: `storyCaption` у неё выключен, подпись не накладывается. Тот же
 * случай — пост без сторис-кадра: тогда в превью идёт голый фон `imageUrl`.
 */
export function needsBrandFooter(post: {
  captionInImage?: boolean;
  storyImageUrl?: string | null;
}): boolean {
  return Boolean(post.captionInImage) || !post.storyImageUrl;
}

/**
 * Раскладка кадра по размеру исходника.
 *
 * Пропорции картинки сохраняются целиком — это и есть лечение «урезанных»
 * открыток. Кадр получается своей формы у каждого поста, поэтому `og:image`
 * отдаётся без `width`/`height`: соврать про размер хуже, чем промолчать —
 * бот всё равно читает настоящий из самого файла.
 */
export function ogPreviewLayout(
  source: { width: number; height: number },
  { scale = 1, footer = true }: { scale?: number; footer?: boolean } = {},
): OgPreviewLayout {
  const srcWidth = Math.max(1, Math.round(source.width));
  const srcHeight = Math.max(1, Math.round(source.height));

  // Ширина: не шире предела, не уже минимума, в остальном — как у исходника.
  let width = Math.min(srcWidth, OG_PREVIEW_MAX_WIDTH);
  let height = Math.round((width * srcHeight) / srcWidth);
  if (height > OG_PREVIEW_MAX_HEIGHT) {
    height = OG_PREVIEW_MAX_HEIGHT;
    width = Math.round((height * srcWidth) / srcHeight);
  }
  if (width < OG_PREVIEW_MIN_WIDTH) {
    // Догоняем до минимума, но не выше потолка по высоте.
    const grown = Math.min(
      OG_PREVIEW_MIN_WIDTH / width,
      OG_PREVIEW_MAX_HEIGHT / height,
    );
    width = Math.round(width * grown);
    height = Math.round(height * grown);
  }

  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const footerHeight = footer ? Math.max(1, Math.round(width / FOOTER_ASPECT)) : 0;
  return {
    width,
    height: height + footerHeight,
    picture: { width, height, left: 0, top: 0 },
    footer: { width, height: footerHeight, left: 0, top: height },
  };
}

/**
 * Перебирает попытки, пока результат не уложится в предел.
 * `encode` — перекодировщик; в маршруте это sharp, в тесте — подделка.
 */
export async function encodeWithinLimit(
  encode: (attempt: OgEncoding) => Promise<Uint8Array>,
  maxBytes: number = OG_IMAGE_MAX_BYTES,
  attempts: readonly OgEncoding[] = OG_IMAGE_ATTEMPTS,
): Promise<{ bytes: Uint8Array; attempt: OgEncoding }> {
  if (attempts.length === 0) throw new Error("no encoding attempts");
  let last: { bytes: Uint8Array; attempt: OgEncoding } | null = null;
  for (const attempt of attempts) {
    const bytes = await encode(attempt);
    last = { bytes, attempt };
    if (bytes.byteLength <= maxBytes) return last;
  }
  return last!;
}

/**
 * Относительный адрес превью. Абсолютным его делает `metadataBase` корневого
 * layout — мессенджеры принимают только полный https-адрес.
 *
 * Адрес живёт под `/m/`, а этот префикс открыт гостю в proxy.ts: бот
 * мессенджера приходит без cookie, и иначе получил бы редирект на лендинг.
 */
export function ogImagePath(slug: string): string {
  return `/m/${encodeURIComponent(slug)}/og`;
}

/** Из какого файла собирать превью: сторис-кадр с подписью, иначе фон. */
export function ogImageSource(post: {
  storyImageUrl?: string | null;
  imageUrl?: string | null;
}): string | null {
  return post.storyImageUrl || post.imageUrl || null;
}
