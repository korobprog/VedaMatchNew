import sharp from 'sharp';

/**
 * Лёгкая копия иллюстрации для показа (VED-629).
 *
 * Сгенерированный кадр лежит в S3 оригиналом PNG 1024×1536 — это мегабайты, и
 * викторина с лентой ждали его на каждом слайде. Показу хватает WebP шириной
 * 720: на телефоне кадр занимает от силы экран, а оригинал остаётся для
 * «открыть полностью» и для сборки сторис, открыток и роликов.
 */
export const IMAGE_THUMB_WIDTH = 720;
export const IMAGE_THUMB_QUALITY = 80;

/**
 * Полноразмерная лёгкая копия (web-копия): те же пиксели, что у оригинала, но
 * WebP вместо PNG. Лента показывает её, а оригинал остаётся для скачивания.
 * Качество 88 — как у загруженных открыток: на мелкой контрастной надписи
 * при меньшем вокруг букв появляется рябь. Шире 2048 не растим и не режем
 * ниже: кадр 1024×1536 уходит как есть.
 */
export const IMAGE_WEB_QUALITY = 88;
export const IMAGE_WEB_MAX_WIDTH = 2048;

/** Суффикс файла web-копии, рядом с `-w720.webp` превью. */
const WEB_SUFFIX = '-web.webp';

/** Суффикс файла копии: по нему её видно в бакете рядом с оригиналом. */
const THUMB_SUFFIX = `-w${IMAGE_THUMB_WIDTH}.webp`;

/**
 * Сколько раз бэкфилл берётся за один пост. Битый или пропавший из бакета
 * файл лучше не станет, а крутить его каждые полминуты незачем.
 */
export const MAX_THUMB_ATTEMPTS = 3;

/**
 * Пауза между попытками одного поста. Она же — срок, после которого пост,
 * взятый упавшим процессом, возвращается в очередь: отметка попытки ставится
 * при клейме, до работы.
 */
export const THUMB_RETRY_PAUSE_MS = 10 * 60_000;

/**
 * Размер копии: ширина не больше `target`, пропорции сохраняются, увеличения
 * нет. Узкий оригинал отдаём как есть по размеру — растянутый он весил бы
 * больше, а резче не стал бы.
 */
export function thumbSize(
  width: number,
  height: number,
  target = IMAGE_THUMB_WIDTH,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0))
    throw new Error(`invalid image size ${width}x${height}`);
  if (width <= target) return { width, height };
  return {
    width: target,
    height: Math.max(1, Math.round((height * target) / width)),
  };
}

/**
 * Ключ копии рядом с оригиналом: `…/v123.png` → `…/v123-w720.webp`. Так в
 * бакете сразу видно, чья это копия, а новая версия картинки получает и новую
 * копию — старая по годовому кэшу в браузере не залипает.
 */
export function thumbKeyForImageKey(imageKey: string): string {
  const slash = imageKey.lastIndexOf('/');
  const dot = imageKey.lastIndexOf('.');
  const base = dot > slash ? imageKey.slice(0, dot) : imageKey;
  return `${base}${THUMB_SUFFIX}`;
}

/**
 * Ключ web-копии рядом с оригиналом: `…/v123.png` → `…/v123-web.webp`. Логика
 * та же, что у превью: новая версия картинки получает и новую копию.
 */
export function webKeyForImageKey(imageKey: string): string {
  const slash = imageKey.lastIndexOf('/');
  const dot = imageKey.lastIndexOf('.');
  const base = dot > slash ? imageKey.slice(0, dot) : imageKey;
  return `${base}${WEB_SUFFIX}`;
}

/**
 * Ключ оригинала по его публичной ссылке — нужен бэкфиллу, у которого есть
 * только `imageUrl`. Ссылка не из нашего хранилища (старый домен, внешний
 * адрес) — `null`: класть копию по чужому пути нельзя.
 */
export function imageKeyFromUrl(
  imageUrl: string,
  publicBase: string,
): string | null {
  const base = publicBase.replace(/\/+$/, '');
  if (!base || !imageUrl.startsWith(`${base}/`)) return null;
  const key = imageUrl.slice(base.length + 1).split(/[?#]/, 1)[0];
  return key ? key : null;
}

/**
 * Ключ копии для бэкфилла: рядом с оригиналом, а для чужой ссылки — в
 * отдельной папке поста с версией, чтобы повтор не переписывал файл под
 * годовым кэшем.
 */
export function backfillThumbKey(
  imageUrl: string,
  publicBase: string,
  postId: string,
  version: number,
): string {
  const key = imageKeyFromUrl(imageUrl, publicBase);
  return key
    ? thumbKeyForImageKey(key)
    : `motivation/thumbs/${postId}/v${version}${THUMB_SUFFIX}`;
}

/**
 * Пережимает оригинал в копию для показа. Поворот по EXIF — на случай
 * загруженной фотографии; у сгенерированной PNG его нет, и он ничего не
 * меняет.
 */
export async function renderImageThumb(bytes: Buffer): Promise<Buffer> {
  const image = sharp(bytes, {
    failOn: 'error',
    limitInputPixels: true,
  }).rotate();
  const meta = await image.metadata();
  // После поворота на 90° ширина и высота меняются местами.
  const turned = (meta.orientation ?? 1) >= 5;
  const size = thumbSize(
    (turned ? meta.height : meta.width) ?? 0,
    (turned ? meta.width : meta.height) ?? 0,
  );
  return image
    .resize(size.width, size.height, { fit: 'fill' })
    .webp({ quality: IMAGE_THUMB_QUALITY })
    .toBuffer();
}

/**
 * Ключ web-копии для бэкфилла: рядом с оригиналом, а для чужой ссылки — в
 * отдельной папке поста с версией (как у превью, ради годового кэша).
 */
export function backfillWebKey(
  imageUrl: string,
  publicBase: string,
  postId: string,
  version: number,
): string {
  const key = imageKeyFromUrl(imageUrl, publicBase);
  return key
    ? webKeyForImageKey(key)
    : `motivation/web/${postId}/v${version}${WEB_SUFFIX}`;
}

/**
 * Пережимает оригинал в web-копию: размер тот же (не больше
 * `IMAGE_WEB_MAX_WIDTH`), кодек WebP q88. Поворот по EXIF — как у превью.
 */
export async function renderImageWeb(bytes: Buffer): Promise<Buffer> {
  const image = sharp(bytes, {
    failOn: 'error',
    limitInputPixels: true,
  }).rotate();
  const meta = await image.metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  const size = thumbSize(
    (turned ? meta.height : meta.width) ?? 0,
    (turned ? meta.width : meta.height) ?? 0,
    IMAGE_WEB_MAX_WIDTH,
  );
  return image
    .resize(size.width, size.height, { fit: 'fill' })
    .webp({ quality: IMAGE_WEB_QUALITY })
    .toBuffer();
}
