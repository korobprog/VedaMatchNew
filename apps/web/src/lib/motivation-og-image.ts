/**
 * Картинка для превью ссылки на афоризм в мессенджерах (VED-201).
 *
 * В `og:image` раньше стоял сам сторис-кадр: PNG 1080×1920 весом около 5 МБ.
 * Max такой разворачивает, остальные — нет. WhatsApp молча пропускает
 * картинку тяжелее ~300 КБ, Telegram и ВКонтакте тоже режут крупные файлы и
 * не любят PNG такого веса. Поэтому превью отдаётся отдельным адресом —
 * уменьшенным JPEG, который гарантированно укладывается в предел.
 *
 * Здесь только чистая часть: размеры, лестница качества и адрес. Само
 * перекодирование — в маршруте `/m/[slug]/og`.
 */

/** Кадр превью: те же 9:16, что у сторис, но вдвое легче по стороне. */
export const OG_IMAGE_WIDTH = 630;
export const OG_IMAGE_HEIGHT = 1120;
export const OG_IMAGE_TYPE = "image/jpeg";

/**
 * Предел веса. WhatsApp — самый строгий из адресатов: всё, что тяжелее
 * примерно 300 КБ, он в карточку не ставит. Берём с запасом.
 */
export const OG_IMAGE_MAX_BYTES = 280_000;

export type OgEncoding = { width: number; height: number; quality: number };

/**
 * Попытки кодирования по порядку: сначала снижаем качество, затем — если
 * картинка очень пёстрая и всё равно не влезла — размер кадра. Последняя
 * ступень отдаётся в любом случае: лёгкое превью лучше, чем никакого.
 */
export const OG_IMAGE_ATTEMPTS: readonly OgEncoding[] = [
  { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, quality: 82 },
  { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, quality: 72 },
  { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, quality: 62 },
  { width: 540, height: 960, quality: 62 },
  { width: 450, height: 800, quality: 55 },
];

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
