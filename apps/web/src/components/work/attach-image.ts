/**
 * Ужатие картинок перед загрузкой в задачу (VED-582): решения без браузера.
 *
 * Жалоба: «задачи со скриншотами добавляются долго». Скриншот телефона — PNG
 * на 2–4 МБ, и всё это время уходит в мобильный интернет, хотя сервер всё
 * равно пережимает картинку в WebP шириной 1600 точек (`work-uploads.service`
 * на API). Поэтому ужимаем до того же в браузере: на сервер уезжает в разы
 * меньше, а то, что человек увидит в карточке, не меняется.
 *
 * Здесь только расчёты — какие файлы трогать, до какого размера и что в итоге
 * отправить; рисование на canvas — в `attach-image-canvas.ts`.
 */

/**
 * Ширина, до которой сервер ужимает картинку вложения. Больше отправлять
 * незачем: лишнее сервер выбросит. Высоту сервер не ограничивает — длинный
 * скриншот страницы остаётся читаемым, — и мы тоже.
 */
export const ATTACH_IMAGE_MAX_WIDTH = 1600;

/**
 * Качество WebP в браузере. Выше серверного (80): картинку ещё раз пережмёт
 * сервер, и двойная потеря на мелком тексте скриншота была бы заметна.
 */
export const ATTACH_IMAGE_QUALITY = 0.9;

/** Мелкие файлы не трогаем: выигрыш — доли секунды, а пережатие не бесплатно. */
export const ATTACH_IMAGE_MIN_BYTES = 200 * 1024;

/**
 * Больше точек canvas на части телефонов не рисует (Safari — 16,7 млн): такой
 * файл — склейка длинного скриншота — уходит как есть.
 */
export const ATTACH_IMAGE_MAX_PIXELS = 16_000_000;

/**
 * GIF не трогаем: canvas берёт только первый кадр, а анимация в задаче —
 * обычно запись того, как воспроизводится ошибка.
 */
const SHRINKABLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Стоит ли пробовать ужать файл до загрузки. */
export function shouldShrinkImage(file: {
  type: string;
  size: number;
}): boolean {
  return SHRINKABLE_TYPES.has(file.type) && file.size >= ATTACH_IMAGE_MIN_BYTES;
}

/**
 * Размер картинки после ужатия, пропорции сохраняются. `null` — рисовать не
 * будем: картинка пустая или слишком большая для canvas.
 */
export function shrunkImageSize(
  width: number,
  height: number,
  maxWidth: number = ATTACH_IMAGE_MAX_WIDTH,
): { width: number; height: number } | null {
  if (width <= 0 || height <= 0) return null;
  const scale = width > maxWidth ? maxWidth / width : 1;
  const size = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
  return size.width * size.height > ATTACH_IMAGE_MAX_PIXELS ? null : size;
}

/**
 * Что отправлять: ужатое — только когда оно правда меньше. Маленький PNG с
 * тремя цветами в WebP бывает и больше исходника, тогда уходит исходник.
 */
export function smallerImage<T extends { size: number }>(
  original: T,
  shrunk: T | null,
): T {
  return shrunk && shrunk.size < original.size ? shrunk : original;
}

/**
 * Имя ужатого файла: расширение по новому формату. Имя человек видит в
 * списке вложений и узнаёт свой скриншот по нему.
 */
export function shrunkImageName(name: string, type: string): string {
  const extension = type === "image/webp" ? ".webp" : ".jpg";
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, "") || "image";
  return `${base}${extension}`;
}
