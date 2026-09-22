/**
 * Картинка для превью ссылки на афоризм в мессенджерах (VED-201, VED-357).
 *
 * В `og:image` когда-то стоял сам сторис-кадр: PNG 1080×1920 весом около 5 МБ.
 * Max такой разворачивает, остальные — нет. WhatsApp молча пропускает
 * картинку тяжелее ~300 КБ, Telegram и ВКонтакте тоже режут крупные файлы и
 * не любят PNG такого веса. Поэтому превью отдаётся отдельным адресом —
 * уменьшенным JPEG, который гарантированно укладывается в предел.
 *
 * Второй заход. Кадр собирался жёстко под 9:16 с `fit: 'cover'`, и это
 * годилось только сторис — они уже вертикальные. А открытка, которую человек
 * принёс готовым файлом, приходит любой формы: у квадратной обрезались бока,
 * у горизонтальной — почти всё. Отсюда «открытки отображаются урезанными».
 *
 * Третий заход. Владелец сравнил мессенджеры и попросил делать как в Max:
 * «чистая от текста картинка, а сам текст сверху или снизу». В `og:image`
 * уезжал `storyImageUrl` — тот же фон, но с впечатанной цитатой, и WhatsApp
 * показывал цитату дважды. Отсюда правило, которое ломать нельзя:
 * **в превью ссылки идёт картинка без наложенного текста** (`ogImageSource`).
 *
 * Четвёртый заход, VED-357. Кадр стал повторять пропорции исходника — и у
 * рилса это вертикальные 900×1350. WhatsApp такую карточку свернул в
 * квадратную миниатюру сбоку: большую он рисует для примерно альбомной
 * картинки с объявленными размерами, а `og:image:width`/`og:image:height`
 * были убраны как раз затем, чтобы не врать про размер «своей формы у
 * каждого поста». Telegram высокий кадр режет по своей рамке — отсюда
 * «картинка урезанная».
 *
 * Отсюда нынешнее устройство: кадр **всегда один и тот же**, канонические
 * 1200×630 (1.91:1), и эти числа объявлены в метатегах. Картинка при этом
 * не кадрируется — за обрезку владелец ругался отдельно и справедливо: она
 * вписывается в кадр целиком (`ogPreviewLayout`), а пустое место по бокам
 * закрывает её же размытая и притемнённая копия. Подложка из самой картинки,
 * а не плашка цветом: белый или фирменный прямоугольник рядом с вертикальной
 * иллюстрацией читается дырой, а размытое продолжение — рамкой.
 *
 * Здесь только чистая часть: раскладка кадра, лестница качества и адрес. Само
 * перекодирование — в маршруте `/m/[slug]/og`.
 */

export const OG_IMAGE_TYPE = "image/jpeg";

/**
 * Кадр превью. Ровно 1.91:1 — тот размер, который WhatsApp, Facebook и
 * ВКонтакте считают «большой карточкой», а Telegram показывает целиком, не
 * подрезая по своей рамке.
 *
 * Величина постоянная и не зависит от исходника: только так `og:image:width`
 * и `og:image:height` можно объявить в метатегах, не соврав. Метатеги
 * собирает `generateMetadata()` в другом запросе — картинки он не видит и
 * посчитать её размер не может.
 */
export const OG_PREVIEW_WIDTH = 1200;
export const OG_PREVIEW_HEIGHT = 630;

/**
 * Подложка: та же картинка, растянутая на весь кадр и размытая.
 *
 * Размывается уменьшенная копия шириной `OG_BACKDROP_SAMPLE_WIDTH`, а не
 * полный кадр: размытие стоит квадрат радиуса, и на 120 пикселях оно почти
 * бесплатно, а растянутое обратно до 1200 даёт ту же мягкую заливку.
 * Притемнение нужно, чтобы подложка не спорила с самой иллюстрацией: без него
 * пёстрые края тянут взгляд сильнее, чем то, что в середине.
 */
export const OG_BACKDROP_SAMPLE_WIDTH = 120;
export const OG_BACKDROP_BLUR = 8;
export const OG_BACKDROP_BRIGHTNESS = 0.55;

/**
 * Фон под прозрачными краями. У JPEG прозрачности нет, и без подложки они
 * стали бы чёрными пятнами непредсказуемой формы.
 */
export const OG_BACKDROP_FALLBACK = "#0A0614";

/**
 * Предел веса. WhatsApp — самый строгий из адресатов: всё, что тяжелее
 * примерно 300 КБ, он в карточку не ставит. Берём с запасом.
 */
export const OG_IMAGE_MAX_BYTES = 280_000;

export type OgEncoding = {
  quality: number;
};

/**
 * Попытки кодирования по порядку: одно только качество, размер кадра не
 * трогаем. Раньше последние ступени уменьшали кадр — теперь это запрещено:
 * объявленные `og:image:width`/`og:image:height` обязаны совпадать с тем, что
 * лежит в файле, иначе бот разложит карточку по вымышленным пропорциям.
 * Запас есть: 1200×630 с размытой подложкой ужимается куда легче, чем
 * прежний вертикальный кадр 900×1350 на весь миллион с лишним пикселей.
 */
export const OG_IMAGE_ATTEMPTS: readonly OgEncoding[] = [
  { quality: 82 },
  { quality: 72 },
  { quality: 62 },
  { quality: 52 },
  { quality: 44 },
];

export interface OgPreviewBox {
  width: number;
  height: number;
}

export interface OgPreviewLayout {
  /** Весь кадр — всегда `OG_PREVIEW_WIDTH` × `OG_PREVIEW_HEIGHT`. */
  frame: OgPreviewBox;
  /** Сама иллюстрация: вписана целиком, пропорции исходника сохранены. */
  art: OgPreviewBox;
  /** Куда её класть, чтобы она стояла посередине кадра. */
  left: number;
  top: number;
}

/**
 * Раскладка кадра по размеру исходника.
 *
 * Иллюстрация вписывается целиком («contain»), а не кадрируется: ровно этого
 * просил владелец, когда у открытки срезало бока вместе с надписью. Мелкую
 * картинку растягиваем до кадра — превью размером с иконку Telegram
 * показывает значком сбоку вместо большой карточки, а лёгкая мягкость при
 * растяжении в превью не видна.
 */
export function ogPreviewLayout(source: OgPreviewBox): OgPreviewLayout {
  const srcWidth = Math.max(1, Math.round(source.width));
  const srcHeight = Math.max(1, Math.round(source.height));
  const frame = { width: OG_PREVIEW_WIDTH, height: OG_PREVIEW_HEIGHT };

  const fit = Math.min(frame.width / srcWidth, frame.height / srcHeight);
  const art = {
    width: Math.min(frame.width, Math.max(1, Math.round(srcWidth * fit))),
    height: Math.min(frame.height, Math.max(1, Math.round(srcHeight * fit))),
  };

  return {
    frame,
    art,
    left: Math.round((frame.width - art.width) / 2),
    top: Math.round((frame.height - art.height) / 2),
  };
}

/** Размер уменьшенной копии, которую размываем под подложку. */
export function ogBackdropSampleSize(): OgPreviewBox {
  return {
    width: OG_BACKDROP_SAMPLE_WIDTH,
    height: Math.max(
      1,
      Math.round(
        (OG_BACKDROP_SAMPLE_WIDTH * OG_PREVIEW_HEIGHT) / OG_PREVIEW_WIDTH,
      ),
    ),
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
