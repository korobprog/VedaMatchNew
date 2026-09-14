/**
 * Картинки новостей (VED-137): что из выбранного или вставленного можно
 * загрузить. Сервер принимает только JPG, PNG и WebP и не больше
 * `ANNOUNCEMENT_MAX_IMAGES` картинок на новость — проверяем то же заранее,
 * чтобы не гонять лишние мегабайты и сказать человеку понятными словами.
 */

export const NEWS_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const NEWS_IMAGE_ACCEPT = NEWS_IMAGE_TYPES.join(",");

/** Картинки из буфера обмена: скриншот приходит файлом `image/png`. */
export function pastedNewsImages(files: FileList | File[] | null | undefined): File[] {
  if (!files) return [];
  return Array.from(files).filter((file) => NEWS_IMAGE_TYPES.includes(file.type));
}

/**
 * Делит выбранные файлы на те, что уйдут на загрузку, и отказы. Место в
 * новости считается от уже прикреплённых картинок.
 */
export function pickNewsUploads(
  files: File[],
  attached: number,
  max: number,
): { upload: File[]; rejected: string[] } {
  const upload: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (!NEWS_IMAGE_TYPES.includes(file.type)) {
      rejected.push(`${file.name}: подходят JPG, PNG и WebP`);
    } else if (attached + upload.length >= max) {
      rejected.push(`${file.name}: не больше ${max} картинок в новости`);
    } else {
      upload.push(file);
    }
  }
  return { upload, rejected };
}
