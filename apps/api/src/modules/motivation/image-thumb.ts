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
