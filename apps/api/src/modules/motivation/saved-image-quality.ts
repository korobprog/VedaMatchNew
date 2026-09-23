/**
 * Качество сохраняемого файла (VED-156, дописка заказчика от 23.09: «размер
 * изображения значительно уменьшился. Сделай 3 кнопки сохранить изображение
 * в разном качестве, чтобы когда нужно хорошее качество можно было его
 * получить»).
 *
 * #486 перевёл файл с PNG на 5 МБ на JPEG около 430 КБ — ради скорости
 * «Отправить в приложение». Лёгкий файл остался по умолчанию, а рядом —
 * два тяжелее: для тех, кому картинка нужна для печати или крупного экрана.
 *
 * Здесь только арифметика: какое разрешение и какие параметры кодирования
 * у каждого качества. Сама сборка — в `saved-image.ts`; так тест проверяет
 * выбор числами, без sharp и без пикселей.
 */

/** Белый список: всё, что не отсюда, API отвергает. */
export const SAVED_IMAGE_QUALITIES = ['light', 'standard', 'max'] as const;
export type SavedImageQuality = (typeof SAVED_IMAGE_QUALITIES)[number];

/** Без параметра — прежний лёгкий файл: так работают старые ссылки. */
export const DEFAULT_SAVED_IMAGE_QUALITY: SavedImageQuality = 'light';

/**
 * Значение из адреса → качество. Пусто — умолчание, чужое значение — `null`
 * (контроллер ответит 400, а не молча отдаст не то).
 */
export function parseSavedImageQuality(raw: unknown): SavedImageQuality | null {
  if (raw === undefined || raw === null || raw === '')
    return DEFAULT_SAVED_IMAGE_QUALITY;
  if (typeof raw !== 'string') return null;
  return (SAVED_IMAGE_QUALITIES as readonly string[]).includes(raw)
    ? (raw as SavedImageQuality)
    : null;
}

/** Ширина кадра сторис и полосы — как было до качеств. */
export const BASE_WIDTH = 1080;
/**
 * Потолок «Максимума»: 1440×2560 — экран флагманского телефона. Больше
 * истории и статусы всё равно ужмут, а файл вырастет вдвое.
 */
export const MAX_WIDTH = 1440;

export type SavedImageEncoding =
  | {
      format: 'jpeg';
      width: number;
      height: number | null;
      /** Параметры `sharp().jpeg()`. */
      options: {
        quality: number;
        mozjpeg: true;
        chromaSubsampling: '4:2:0' | '4:4:4';
      };
      contentType: 'image/jpeg';
      extension: 'jpg';
    }
  | {
      format: 'png';
      width: number;
      height: number | null;
      /** Параметры `sharp().png()`. */
      options: { compressionLevel: number; adaptiveFiltering: true };
      contentType: 'image/png';
      extension: 'png';
    };

/**
 * Ширина, выше которой исходник пришлось бы растягивать.
 *
 * Кадр сторис — 9:16 с обрезкой по «cover»: исходник не растягивается, пока
 * ширина кадра не больше ширины исходника и высота кадра не больше его
 * высоты. Картинка с надписью (полоса снизу) идёт во всю ширину, её предел —
 * просто ширина исходника.
 *
 * Ниже базовых 1080 не опускаемся: «Максимум» не может выйти меньше
 * «Лёгкого». Ширина сторис кратна 9, чтобы высота вышла ровно 16/9 от неё.
 */
export function maxWidthFor(
  kind: 'story' | 'band',
  source: { width: number; height: number },
): number {
  const fit =
    kind === 'story'
      ? Math.min(source.width, Math.floor((source.height * 9) / 16))
      : source.width;
  const clamped = Math.min(MAX_WIDTH, Math.max(BASE_WIDTH, fit));
  return kind === 'story' ? Math.floor(clamped / 9) * 9 : clamped;
}

/**
 * Разрешение и параметры кодирования для качества.
 *
 * - `light` — ровно прежний файл из #486: JPEG 88, цветность 4:2:0.
 * - `standard` — тот же размер, но JPEG 92 и цветность без прореживания
 *   (4:4:4): на тонких буквах цитаты и на знаке нет цветной каймы.
 * - `max` — PNG без потерь, в разрешении до 1440 по ширине, если исходник
 *   позволяет. На сгенерированных иллюстрациях (1024×1536) это 1080×1920:
 *   выше пришлось бы растягивать.
 *
 * `height` — `null` для полосы: высоту задаёт пропорция исходника.
 */
export function savedImageEncoding(
  quality: SavedImageQuality,
  kind: 'story' | 'band',
  source: { width: number; height: number },
): SavedImageEncoding {
  const width = quality === 'max' ? maxWidthFor(kind, source) : BASE_WIDTH;
  const height = kind === 'story' ? Math.round((width * 16) / 9) : null;
  if (quality === 'max')
    return {
      format: 'png',
      width,
      height,
      options: { compressionLevel: 9, adaptiveFiltering: true },
      contentType: 'image/png',
      extension: 'png',
    };
  return {
    format: 'jpeg',
    width,
    height,
    options:
      quality === 'standard'
        ? { quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' }
        : { quality: 88, mozjpeg: true, chromaSubsampling: '4:2:0' },
    contentType: 'image/jpeg',
    extension: 'jpg',
  };
}

/** Тип файла качества — известен до сборки: от него ключ и заголовок ответа. */
export function savedImageFileType(quality: SavedImageQuality): {
  contentType: SavedImageEncoding['contentType'];
  extension: SavedImageEncoding['extension'];
} {
  const { contentType, extension } = savedImageEncoding(quality, 'story', {
    width: BASE_WIDTH,
    height: BASE_WIDTH * 2,
  });
  return { contentType, extension };
}

/**
 * Что из качества входит в ключ кэша, кроме самого плана: всё, от чего
 * зависят байты файла, — формат, параметры и потолок разрешения. Сам размер
 * исходника сюда не входит: он определяется адресом исходника, а адрес уже
 * есть в плане. Поправили числа выше — ключ другой, файл соберётся заново.
 */
export function qualityCacheTag(quality: SavedImageQuality): string {
  // Исходник «без предела» — чтобы в ключ попал потолок ширины.
  const unbounded = { width: 100_000, height: 100_000 };
  return JSON.stringify({
    quality,
    story: savedImageEncoding(quality, 'story', unbounded),
    band: savedImageEncoding(quality, 'band', unbounded),
  });
}
