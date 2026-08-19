/**
 * Подготовка загруженного кадра для рилса: что считать допустимым файлом и
 * какую область снимка оставить под вертикальный формат. Чистая часть — здесь,
 * запись в S3 и sharp — в сервисе.
 */

export const MAX_REEL_IMAGE_BYTES = 12 * 1024 * 1024;
export const REEL_IMAGE_WIDTH = 1080;
export const REEL_IMAGE_HEIGHT = 1920;
export const ALLOWED_REEL_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
/** Меньше этого кадр растянет цитату по пикселям — на телефоне видно сразу. */
export const MIN_REEL_IMAGE_SIDE = 400;

export type ReelImageProblem =
  | 'image_required'
  | 'unsupported_image_type'
  | 'image_file_too_large'
  | 'image_too_small';

export interface UploadedReelImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** `null` — файл можно обрабатывать. */
export function validateReelImage(
  file: UploadedReelImage | undefined,
): ReelImageProblem | null {
  if (!file?.buffer?.length) return 'image_required';
  if (!ALLOWED_REEL_IMAGE_MIME.has(file.mimetype))
    return 'unsupported_image_type';
  if (file.size > MAX_REEL_IMAGE_BYTES) return 'image_file_too_large';
  return null;
}

/** Сообщение человеку: коды наружу не выносим. */
export function reelImageMessage(problem: ReelImageProblem): string {
  switch (problem) {
    case 'image_required':
      return 'Выберите файл с картинкой';
    case 'unsupported_image_type':
      return 'Подойдёт JPEG, PNG или WebP';
    case 'image_file_too_large':
      return `Файл больше ${Math.round(MAX_REEL_IMAGE_BYTES / (1024 * 1024))} МБ — уменьшите его`;
    case 'image_too_small':
      return `Картинка слишком маленькая: нужна сторона хотя бы ${MIN_REEL_IMAGE_SIDE} точек`;
  }
}

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Область под вертикальный кадр 9:16. Берём максимальный прямоугольник нужной
 * пропорции и центрируем его по горизонтали, а по вертикали смещаем к верхней
 * трети: на портретных снимках лица и небо там, а низ кадра всё равно закроет
 * подложка с цитатой.
 */
export function coverCrop(
  width: number,
  height: number,
  targetRatio = REEL_IMAGE_WIDTH / REEL_IMAGE_HEIGHT,
): CropRect {
  const sourceRatio = width / height;
  if (sourceRatio > targetRatio) {
    // Кадр шире нужного — режем по бокам поровну.
    const cropWidth = Math.round(height * targetRatio);
    return {
      left: Math.round((width - cropWidth) / 2),
      top: 0,
      width: cropWidth,
      height,
    };
  }
  const cropHeight = Math.round(width / targetRatio);
  return {
    left: 0,
    top: Math.round((height - cropHeight) / 3),
    width,
    height: cropHeight,
  };
}

/** Ключ объекта в S3: по автору и посту, со случайной частью против кеша. */
export function reelImageKey(postId: string, version: number): string {
  return `motivation/uploads/${postId}/v${version}.webp`;
}
