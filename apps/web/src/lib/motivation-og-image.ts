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
 * (`fit: 'inside'`), ничего не обрезается.
 *
 * Третий заход. Владелец сравнил мессенджеры и попросил делать как в Max:
 * «чистая от текста картинка, а сам текст сверху или снизу». В Max так и
 * выходит — он берёт с самой страницы `imageUrl`, чистую иллюстрацию 1024×1536,
 * и подписывает её заголовком и описанием превью. А в `og:image` уезжал
 * `storyImageUrl` — тот же фон, но с впечатанной цитатой и знаком
 * (`composeStoryImage()` в API). Поэтому WhatsApp показывал цитату дважды:
 * в теле сообщения и поверх картинки, а Telegram ещё и подрезал кадр 9:16,
 * обрывая впечатанный текст на полуслове.
 *
 * Отсюда правило: **в превью ссылки идёт картинка без наложенного текста**.
 * Текст уже есть и в теле сообщения, и в описании превью
 * (`share-meta.ts`) — третья копия лишняя, а обрезанная третья копия вредна.
 * Сторис-кадр с цитатой остаётся там, где он и нужен: в «Скачать для Stories»
 * (`/m/[slug]/story`) и в ролике.
 *
 * Здесь только чистая часть: размер кадра, лестница качества и адрес. Само
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
 * Нижняя граница ширины. Картинку меньше этого слегка растягиваем: Telegram
 * мелкое превью показывает значком сбоку вместо большой карточки.
 */
export const OG_PREVIEW_MIN_WIDTH = 600;

/**
 * Предел веса. WhatsApp — самый строгий из адресатов: всё, что тяжелее
 * примерно 300 КБ, он в карточку не ставит. Берём с запасом.
 */
export const OG_IMAGE_MAX_BYTES = 280_000;

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

export interface OgPreviewSize {
  width: number;
  height: number;
}

/**
 * Размер кадра превью по размеру исходника.
 *
 * Пропорции сохраняются целиком — это и есть лечение «урезанных» открыток.
 * Кадр получается своей формы у каждого поста, поэтому `og:image` отдаётся
 * без `width`/`height`: соврать про размер хуже, чем промолчать — бот всё
 * равно читает настоящий из самого файла.
 *
 * Полосы с подписью бренда снизу здесь больше нет. Её добавили прошлым
 * заходом (PR #416, «нет подписи скачано в VedaMatch с логотипом»), но
 * владелец, сравнив мессенджеры, попросил ровно обратного: «чистая от текста
 * картинка, а сам текст сверху или снизу» — то есть как в Max, где под
 * картинкой идут заголовок и описание превью, а на самой картинке нет ни
 * строки. Надпись на скачиваемом файле — отдельная история и отдельная
 * карточка: там она по-прежнему на месте, её рисует `composeStoryImage()`
 * в API прямо в сторис-кадр.
 */
export function ogPreviewSize(
  source: { width: number; height: number },
  { scale = 1 }: { scale?: number } = {},
): OgPreviewSize {
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

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
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

/**
 * Из какого файла собирать превью — из `imageUrl`, самой иллюстрации.
 *
 * `storyImageUrl` сюда не годится и не берётся даже запасным вариантом: это
 * тот же фон, но с впечатанной цитатой и знаком. Пока брали его, WhatsApp
 * показывал текст дважды, а Telegram — ещё и обрубленным на полуслове, потому
 * что режет кадр 9:16 по своей рамке. Пустой `imageUrl` без картинки бывает
 * только у неопубликованного поста; отдать вместо превью кадр с обрезанным
 * текстом хуже, чем не отдать превью вовсе, — тогда мессенджер покажет
 * карточку из одного заголовка и описания.
 */
export function ogImageSource(post: {
  imageUrl?: string | null;
  /**
   * Объявлен, но не читается — намеренно. Пост приходит сюда целиком, и поле
   * в сигнатуре держит договор на виду: сторис-кадр рядом есть, и он всё
   * равно не берётся. Тест рядом проверяет ровно это.
   */
  storyImageUrl?: string | null;
}): string | null {
  return post.imageUrl || null;
}
