import sharp from 'sharp';

/**
 * Предел длинной стороны снимка в хранилище.
 *
 * Кадр с телефона — 4032×3024, и до появления этого предела он ложился в S3
 * как есть: конвейер менял формат на webp, но не размер. Карточка знакомств
 * шириной 360px тянула кадр целиком и целиком его декодировала — на Android
 * это видно рывком при перелистывании, на медленной связи пустым местом
 * вместо фото.
 *
 * 1600 хватает и полноэкранному просмотру на плотном экране, и любому будущему
 * ретина-варианту карточки. Столько же у вложений чата; у рынка и объявлений
 * 1280 — там снимок не бывает главным на экране.
 */
export const MAX_IMAGE_DIMENSION = 1600;

/** Суффикс ключа для ужатой копии. */
const SHRUNK_SUFFIX = `-w${MAX_IMAGE_DIMENSION}`;

export interface StorageImage {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Снимок в том виде, в каком он должен лежать в хранилище.
 *
 * Живёт отдельно от сервиса намеренно: тем же преобразованием пользуется
 * разовый проход по уже залитым фотографиям, и две копии этой логики
 * разошлись бы при первой же правке предела.
 */
export async function toStorageImage(input: Buffer): Promise<StorageImage> {
  const output = await sharp(input, { failOn: 'error', limitInputPixels: true })
    // Поворот идёт первым: у кадра с EXIF-ориентацией стороны меняются
    // местами, и предел нужно применять уже к тому, что человек увидит.
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      // `inside` держит пропорции, `withoutEnlargement` не даёт растянуть
      // маленький снимок до предела: увеличенный пиксель не станет лучше,
      // а весить будет больше исходного.
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer({ resolveWithObject: true });

  if (!output.info.width || !output.info.height) {
    throw new Error('Missing output dimensions');
  }
  return {
    data: output.data,
    width: output.info.width,
    height: output.info.height,
  };
}

/** Снимок больше предела хотя бы одной стороной — значит его стоит ужать. */
export function needsShrink(width: number, height: number): boolean {
  return width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION;
}

/**
 * Ключ для ужатой копии рядом с оригиналом.
 *
 * Оригинал остаётся на месте: проход по старым фотографиям обязан быть
 * обратимым, а перезапись объекта стёрла бы единственный экземпляр снимка,
 * который человек когда-то загрузил. Суффикс детерминированный, поэтому
 * повторный запуск не плодит копий, а откат — это возврат прежнего ключа.
 */
export function shrunkStorageKey(storageKey: string): string {
  if (storageKey.includes(SHRUNK_SUFFIX)) return storageKey;
  const dot = storageKey.lastIndexOf('.');
  if (dot <= storageKey.lastIndexOf('/'))
    return `${storageKey}${SHRUNK_SUFFIX}`;
  return `${storageKey.slice(0, dot)}${SHRUNK_SUFFIX}${storageKey.slice(dot)}`;
}

/** Уже ужатая копия — по такому ключу проходить второй раз незачем. */
export function isShrunkStorageKey(storageKey: string): boolean {
  return storageKey.includes(SHRUNK_SUFFIX);
}

/**
 * Демо-аккаунты из dev-сида хранят готовый URL вместо ключа объекта S3 —
 * подписывать и перезаписывать такие нечего.
 */
export function isDirectUrl(storageKey: string): boolean {
  return (
    storageKey.startsWith('/') ||
    storageKey.startsWith('http://') ||
    storageKey.startsWith('https://')
  );
}
